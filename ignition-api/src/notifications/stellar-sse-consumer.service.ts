/**
 * Issue #265 — Stellar SSE Consumer (Redis-backed)
 *
 * Subscribes to the Horizon payments SSE stream for each active wallet,
 * maps incoming payment operations to NotificationType events, writes rows
 * into the `notifications` table, and signals the realtime layer.
 *
 * Redis is used for two purposes:
 *   1. Cursor persistence — the `paging_token` of the last processed
 *      operation is stored per-wallet so the consumer resumes after a
 *      restart without replaying already-seen events.
 *   2. Fan-out de-duplication — a short-lived Redis key keyed on the
 *      Stellar txHash prevents the same payment from creating duplicate
 *      notification rows if the SSE stream emits the event more than once
 *      (e.g. during a reconnect).
 */

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import Keyv from 'keyv';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNotificationParams,
  NotificationsService,
} from './notifications.service';

/** Operation type values returned by Horizon. */
enum HorizonOpType {
  PAYMENT = 'payment',
  CREATE_ACCOUNT = 'create_account',
  PATH_PAYMENT_STRICT_SEND = 'path_payment_strict_send',
  PATH_PAYMENT_STRICT_RECEIVE = 'path_payment_strict_receive',
}

interface HorizonPaymentRecord {
  id: string;
  type: string;
  paging_token: string;
  transaction_hash: string;
  to?: string;
  from?: string;
  amount?: string;
  asset_code?: string;
}

/**
 * Combine several abort signals into one.  The returned signal aborts as soon as
 * *any* of the inputs aborts.  Used to merge the shutdown signal with a
 * connection idle watchdog so a dead connection can be torn down independently
 * of (and without being mistaken for) a graceful shutdown.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/** Redis key for the last seen paging cursor per Stellar address. */
const CURSOR_KEY = (address: string) => `horizon:cursor:${address}`;

/** Redis key used for txHash de-duplication (TTL 24 h). */
const DEDUP_KEY = (txHash: string) => `horizon:seen:${txHash}`;

/** 24 hours in ms — duration for de-duplication entries. */
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

/** How long to wait before reconnecting after an SSE error (ms). */
const RECONNECT_DELAY_MS = 5_000;

/**
 * Upper bound for the reconnect backoff.  Prevents an exponential reconnect
 * storm from hammering Horizon when it (or the network) is unhealthy.
 */
const MAX_RECONNECT_DELAY_MS = 60_000;

/**
 * If no bytes are received from Horizon within this window, the connection is
 * assumed dead (e.g. a half-open TCP socket after a network drop) and is force
 * torn down so the consumer reconnects.  Horizon does not emit periodic
 * keep-alives, so this must be comfortably larger than the expected gap between
 * legitimate payments.
 */
const STREAM_IDLE_TIMEOUT_MS = 90_000;

@Injectable()
export class StellarSseConsumerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(StellarSseConsumerService.name);

  /** Horizon base URL, e.g. https://horizon-testnet.stellar.org */
  private readonly horizonUrl: string;

  /** Set of AbortControllers, one per watched address. */
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
  ) {
    this.horizonUrl = this.config.get<string>(
      'HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
  }

  // ── Lifecycle hooks ──────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.startAllWatchers();
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Shutting down Horizon SSE consumers …');
    for (const [address, controller] of this.controllers.entries()) {
      controller.abort();
      this.controllers.delete(address);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Start (or restart) the SSE watcher for a single Stellar deposit address.
   * Called by onModuleInit and also exposed so a campaign controller can
   * register newly-created wallets without a restart.
   */
  async watchAddress(address: string): Promise<void> {
    const existing = this.controllers.get(address);
    // Already watching with a live connection — nothing to do.
    if (existing && !existing.signal.aborted) return;
    // No watcher, or the previous one died without cleaning up — (re)start it.
    this.controllers.delete(address);
    this.logger.log(`Starting SSE watcher for address ${address}`);
    void this.streamPayments(address); // run in background
  }

  /** Stop watching an address (e.g. when a wallet is deactivated). */
  stopWatching(address: string): void {
    const ctrl = this.controllers.get(address);
    if (ctrl) {
      ctrl.abort();
      this.controllers.delete(address);
      this.logger.log(`Stopped SSE watcher for address ${address}`);
    }
  }

  // ── Private: bootstrap ───────────────────────────────────────────────────

  private async startAllWatchers(): Promise<void> {
    try {
      const wallets = await this.prisma.wallet.findMany({
        where: { isActive: true, deletedAt: null },
        select: { depositAddress: true },
      });

      this.logger.log(
        `Registering SSE watchers for ${wallets.length} active wallet(s)`,
      );

      for (const { depositAddress } of wallets) {
        void this.watchAddress(depositAddress);
      }
    } catch (err) {
      this.logger.error('Failed to load active wallets for SSE bootstrap', err);
    }
  }

  // ── Private: SSE stream loop ─────────────────────────────────────────────

  /**
   * Long-running loop that maintains a persistent SSE connection to Horizon
   * for one Stellar address.  Reconnects automatically after errors or a dead
   * connection, with exponential backoff that resets once data flows again.
   */
  private async streamPayments(address: string): Promise<void> {
    let backoff = RECONNECT_DELAY_MS;

    while (true) {
      const controller = new AbortController();
      this.controllers.set(address, controller);

      try {
        await this.consumeStream(address, controller, () => {
          // Data received → connection is healthy, reset the backoff.
          backoff = RECONNECT_DELAY_MS;
        });
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          // Graceful shutdown / explicit stop — leave the loop.
          this.controllers.delete(address);
          return;
        }
        this.logger.warn(
          `SSE stream error for ${address}: ${(err as Error).message}. ` +
            `Reconnecting in ${backoff / 1000}s …`,
        );
      }

      if (controller.signal.aborted) {
        this.controllers.delete(address);
        return;
      }

      await this.delay(backoff);
      // Exponential backoff capped at MAX_RECONNECT_DELAY_MS.
      backoff = Math.min(backoff * 2, MAX_RECONNECT_DELAY_MS);
    }
  }

  /**
   * Attach to Horizon's payments SSE endpoint, parse events, and call
   * handlePayment() for each incoming operation.
   *
   * `controller` is the shutdown/stop controller owned by this watcher.  A
   * separate idle watchdog controller is layered on top so that a connection
   * which stops delivering data (without a clean close) is force-aborted and
   * the caller reconnects.  `onActivity` is invoked whenever bytes arrive so
   * the reconnect backoff can be reset.
   */
  private async consumeStream(
    address: string,
    controller: AbortController,
    onActivity: () => void,
  ): Promise<void> {
    const cursor = await this.getCursor(address);
    const url = `${this.horizonUrl}/accounts/${encodeURIComponent(address)}/payments?cursor=${cursor}&order=asc&limit=100`;

    // Merge the shutdown signal with an idle watchdog.  Aborting either one
    // tears down the fetch; the caller distinguishes the two cases by checking
    // `controller.signal.aborted` (shutdown) vs. the returned AbortError (idle).
    const idleController = new AbortController();
    const signal = anySignal([controller.signal, idleController.signal]);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal,
      });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      throw err;
    }

    if (!response.ok) {
      throw new Error(
        `Horizon returned HTTP ${response.status} for ${address}`,
      );
    }

    const body = response.body;
    if (!body) throw new Error('Response body is null');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Idle watchdog: if no data arrives within the window, abort the idle
    // controller so reader.read() rejects and we fall through to a reconnect.
    let idleTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.logger.warn(
        `No data received from Horizon for ${address} in ` +
          `${STREAM_IDLE_TIMEOUT_MS / 1000}s — forcing reconnect`,
      );
      idleController.abort();
    }, STREAM_IDLE_TIMEOUT_MS);

    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => idleController.abort(),
        STREAM_IDLE_TIMEOUT_MS,
      );
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Any bytes received → connection is alive; reset watchdog + backoff.
        armIdleTimer();
        onActivity();

        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by a blank line (\n\n)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() ?? '';

        for (const message of messages) {
          if (!message.trim()) continue;
          const dataLine = message
            .split('\n')
            .find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          const json = dataLine.slice(5).trim();
          if (json === '"hello"' || json === '"byebye"') continue; // Horizon heartbeats

          try {
            const record: HorizonPaymentRecord = JSON.parse(json);
            await this.handlePayment(address, record);
          } catch {
            this.logger.debug(`Could not parse SSE data for ${address}`);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        // Triggered by the idle watchdog or a shutdown — let the caller decide
        // whether to exit or reconnect based on `controller.signal.aborted`.
        return;
      }
      throw err;
    } finally {
      clearTimeout(idleTimer);
      reader.releaseLock();
    }
  }

  // ── Private: event handling ──────────────────────────────────────────────

  /**
   * Decide what notification to emit for an incoming Horizon payment record.
   * Only payment and path-payment operations targeting our watched address
   * are acted on; everything else is skipped.
   */
  private async handlePayment(
    watchedAddress: string,
    record: HorizonPaymentRecord,
  ): Promise<void> {
    const relevantTypes: string[] = [
      HorizonOpType.PAYMENT,
      HorizonOpType.PATH_PAYMENT_STRICT_SEND,
      HorizonOpType.PATH_PAYMENT_STRICT_RECEIVE,
    ];

    if (!relevantTypes.includes(record.type)) return;
    if (record.to !== watchedAddress) return;

    // Atomic SET NX de-duplication — replaces the previous get→set TOCTOU pattern.
    //
    // cache.set() with the Keyv interface returns `true` when the key was newly
    // written and `false` (or a falsy value) when it already existed (NX semantics).
    // This single atomic operation eliminates the race window that existed when a
    // separate get() and set() were called sequentially: two concurrent consumers
    // reconnecting after an SSE drop could both pass the old `if (seen) return`
    // check before either had a chance to write the key.
    const dedupKey = DEDUP_KEY(record.transaction_hash);
    const claimed = await this.cache.set(dedupKey, '1', DEDUP_TTL_MS);
    if (!claimed) return; // another handler already owns this tx

    // Resolve the wallet → campaign → user chain
    await this.dispatchDomainEvents(watchedAddress, record);

    // Persist the cursor so a restart resumes here
    await this.setCursor(watchedAddress, record.paging_token);
  }

  /**
   * Walk the wallet → campaign (active/completed) → related users chain
   * and emit the appropriate NotificationType events.
   *
   * Covers all three types specified in Issue #265:
   *   - DONATION_RECEIVED   — a payment arrived at a campaign deposit address
   *   - MILESTONE_REACHED   — any active milestone whose targetAmount is now met
   *   - CAMPAIGN_COMPLETED  — the campaign goalAmount is fully funded
   */
  private async dispatchDomainEvents(
    walletAddress: string,
    record: HorizonPaymentRecord,
  ): Promise<void> {
    // Resolve wallet
    const wallet = await this.prisma.wallet.findUnique({
      where: { depositAddress: walletAddress },
      select: { id: true, userId: true },
    });
    if (!wallet) return;

    const amount = parseFloat(record.amount ?? '0');
    const asset = record.asset_code ?? 'XLM';

    // Find active campaigns owned by this wallet's user that just received a payment
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        creatorId: wallet.userId,
        status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
      },
      include: {
        milestones: { where: { status: 'ACTIVE' } },
      },
    });

    // Accumulate every notification emitted while walking the campaigns so
    // they can be flushed in a single batched insert instead of one
    // sequential round-trip per notification (issue #442).
    const notificationsToCreate: CreateNotificationParams[] = [];

    for (const campaign of campaigns) {
      // ── DONATION_RECEIVED ─────────────────────────────────────────────
      notificationsToCreate.push({
        userId: wallet.userId,
        type: NotificationType.DONATION_RECEIVED,
        title: 'Donation received',
        message: `Your campaign "${campaign.title}" received ${amount} ${asset}.`,
        relatedId: campaign.id,
      });

      // Execute database modifications inside a transaction for atomicity and thread-safety
      const { updatedCampaign, completedMilestoneIds, campaignCompleted } =
        await this.prisma.$transaction(async (tx) => {
          // 1. Atomically increment the campaign's raisedAmount
          const currentCampaign = await tx.campaign.update({
            where: { id: campaign.id },
            data: {
              raisedAmount: {
                increment: amount,
              },
            },
            include: {
              milestones: { where: { status: 'ACTIVE' } },
            },
          });

          const newRaisedAmount = Number(currentCampaign.raisedAmount);

          // 2. Identify and complete qualifying milestones
          const completedMilestoneIds: string[] = [];
          for (const milestone of currentCampaign.milestones) {
            if (newRaisedAmount >= Number(milestone.targetAmount)) {
              await tx.milestone.update({
                where: { id: milestone.id },
                data: { status: 'COMPLETED', completedAt: new Date() },
              });
              completedMilestoneIds.push(milestone.id);
            }
          }

          // 3. Complete the campaign if the goal has been met
          let campaignCompleted = false;
          if (
            newRaisedAmount >= Number(currentCampaign.goalAmount) &&
            currentCampaign.status !== 'COMPLETED'
          ) {
            await tx.campaign.update({
              where: { id: campaign.id },
              data: { status: 'COMPLETED' },
            });
            campaignCompleted = true;
          }

          return {
            updatedCampaign: currentCampaign,
            completedMilestoneIds,
            campaignCompleted,
          };
        });

      // ── MILESTONE_REACHED ──────────────────────────────────────────────
      for (const milestoneId of completedMilestoneIds) {
        const milestone = campaign.milestones.find((m) => m.id === milestoneId);
        notificationsToCreate.push({
          userId: wallet.userId,
          type: NotificationType.MILESTONE_REACHED,
          title: 'Milestone reached',
          message: `Milestone "${milestone?.title ?? ''}" in campaign "${campaign.title}" has been reached!`,
          relatedId: milestoneId,
        });
      }

      // ── CAMPAIGN_COMPLETED ─────────────────────────────────────────────
      if (campaignCompleted) {
        notificationsToCreate.push({
          userId: wallet.userId,
          type: NotificationType.CAMPAIGN_COMPLETED,
          title: 'Campaign completed',
          message: `Your campaign "${campaign.title}" has reached its funding goal!`,
          relatedId: campaign.id,
        });
      }
    }

    // Flush all accumulated notifications in a single batched insert.
    await this.notifications.createMany(notificationsToCreate);

    this.logger.log(
      `Processed Horizon payment ${record.transaction_hash} → address ${walletAddress}`,
    );
  }

  // ── Private: cursor helpers ──────────────────────────────────────────────

  private async getCursor(address: string): Promise<string> {
    const stored = await this.cache.get<string>(CURSOR_KEY(address));
    return stored ?? 'now';
  }

  private async setCursor(address: string, cursor: string): Promise<void> {
    // Keep the cursor indefinitely (no TTL) so it survives restarts.
    await this.cache.set(CURSOR_KEY(address), cursor);
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
