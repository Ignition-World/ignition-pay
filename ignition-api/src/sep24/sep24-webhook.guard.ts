import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Sep24WebhookVerificationService } from './sep24-webhook-verification.service';

/**
 * Sep24WebhookGuard
 *
 * NestJS `CanActivate` guard that validates the SEP-24 webhook signature
 * before a request reaches the callback controller.
 *
 * Required headers:
 *   Webhook-Id        – unique ID for this webhook delivery
 *   Webhook-Signature – "v1,<base64>" signed over "<Webhook-Id>.<rawBody>"
 *
 * Optional header:
 *   Webhook-Timestamp – Unix seconds the delivery was created. When present it
 *                       must fall inside the configured tolerance window
 *                       (Issue #618); the timestamp is not part of the signed
 *                       payload, so it does not authenticate anything on its
 *                       own — it only bounds replay of a captured request.
 *
 * The `anchorId` is expected as a route parameter (`:anchorId`).
 *
 * Raw body access requires the NestJS application to be started with:
 *   app.use(express.json({ verify: (req, _res, buf) => { req['rawBody'] = buf; } }))
 * or equivalent middleware, which is configured in main.ts.
 */
@Injectable()
export class Sep24WebhookGuard implements CanActivate {
  private readonly logger = new Logger(Sep24WebhookGuard.name);

  constructor(
    private readonly webhookVerification: Sep24WebhookVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();

    // ── 1. Extract required headers ───────────────────────────────────────
    const webhookId = request.headers['webhook-id'] as string | undefined;
    const signature = request.headers['webhook-signature'] as string | undefined;

    if (!webhookId) {
      this.logger.warn('SEP-24 webhook rejected: missing Webhook-Id header');
      throw new UnauthorizedException('Missing Webhook-Id header');
    }

    if (!signature) {
      this.logger.warn('SEP-24 webhook rejected: missing Webhook-Signature header');
      throw new UnauthorizedException('Missing Webhook-Signature header');
    }

    // ── 2. Extract anchor ID from route params ────────────────────────────
    const anchorId = Array.isArray(request.params?.anchorId)
      ? request.params.anchorId[0]
      : request.params?.anchorId;
    if (!anchorId) {
      this.logger.warn('SEP-24 webhook rejected: missing anchorId route param');
      throw new UnauthorizedException('Cannot determine anchor identity');
    }

    // ── 3. Get raw body ───────────────────────────────────────────────────
    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      this.logger.warn(
        `SEP-24 webhook [${anchorId}]: raw body unavailable – ensure rawBody middleware is configured`,
      );
      throw new UnauthorizedException('Raw body unavailable for signature verification');
    }

    // ── 4. Verify ─────────────────────────────────────────────────────────
    // Issue #618: forward the optional Webhook-Timestamp so the service can
    // reject deliveries outside the tolerance window. An absent or
    // non-numeric header is simply not checked — existing anchors that do not
    // send one keep working, and a malformed value is never treated as "now".
    const timestampHeader = request.headers['webhook-timestamp'];
    const parsedTimestamp =
      typeof timestampHeader === 'string' && /^\d+$/.test(timestampHeader.trim())
        ? Number.parseInt(timestampHeader.trim(), 10)
        : undefined;

    if (timestampHeader !== undefined && parsedTimestamp === undefined) {
      this.logger.warn(
        `SEP-24 webhook [${anchorId}]: ignoring malformed Webhook-Timestamp header`,
      );
    }

    await this.webhookVerification.verifyOrThrow(
      anchorId,
      webhookId,
      signature,
      rawBody,
      { timestampSeconds: parsedTimestamp },
    );
    return true;
  }
}
