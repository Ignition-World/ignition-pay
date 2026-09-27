import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { initSentry } from './common/sentry/sentry.middleware';
import { ValidationExceptionFilter } from './common/validation-exception.filter';
import { ApiKeyExpirationService } from './api-keys/api-key-expiration.service';
import { ShutdownState } from './common/shutdown/shutdown.state';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  QUEUE_EMAIL,
  QUEUE_CONTRACT_EVENTS,
  QUEUE_ANALYTICS,
  QUEUE_PAYMENTS,
  QUEUE_HORIZON,
} from './queue/queue.constants';
import type { Request, Response } from 'express';
import * as express from 'express';
import type { INestApplication, LoggerService } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import {
  BODY_SIZE_LIMIT_METADATA_KEY,
  DEFAULT_JSON_BODY_LIMIT,
  DEFAULT_URLENCODED_BODY_LIMIT,
  byteLimitEnvValue,
  resolveByteLimit,
} from './common/http/payload-limits';
import {
  createPayloadLimitErrorHandler,
} from './common/http/payload-limit.middleware';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Issue #622 — read the `@MaxBodySize()` limit configured for the route being
 * served, if any.
 *
 * The parsers below run as plain Express middleware, before Nest's routing
 * layer, so the metadata is read straight off the matched handler with the
 * reflect-metadata API Nest itself uses. Handler metadata wins over
 * controller metadata, matching the handler-then-controller precedence
 * `applyHostFilter` applies to guards, interceptors and filters.
 */
function bodyLimitOverride(req: IncomingMessage): string | number | undefined {
  const handler = (req as IncomingMessage & { route?: { handler?: Function } })
    .route?.handler;
  if (!handler) return undefined;

  return (
    Reflect.getMetadata(BODY_SIZE_LIMIT_METADATA_KEY, handler) ??
    Reflect.getMetadata(BODY_SIZE_LIMIT_METADATA_KEY, handler.constructor)
  );
}

const QUEUE_NAMES = [
  QUEUE_EMAIL,
  QUEUE_CONTRACT_EVENTS,
  QUEUE_ANALYTICS,
  QUEUE_PAYMENTS,
  QUEUE_HORIZON,
];

function registerGracefulShutdown(
  app: INestApplication,
  logger: LoggerService,
): void {
  const shutdownState = app.get(ShutdownState);

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown`);
    shutdownState.markShuttingDown();

    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      for (const name of QUEUE_NAMES) {
        const queue = app.get<Queue>(getQueueToken(name), { strict: false });
        await queue?.pause();
      }

      // app.close() stops the HTTP server from accepting new connections,
      // waits for in-flight requests to finish, then runs onModuleDestroy
      // hooks (Prisma disconnect, etc.) across the module tree.
      await app.close();

      clearTimeout(forceExitTimer);
      logger.log('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExitTimer);
      logger.error('Error during graceful shutdown', err as Error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

async function bootstrap() {
  initSentry(process.env.SENTRY_DSN ?? '');

  // rawBody: true enables NestJS raw body access required by Sep24WebhookGuard
  // for signature verification over the original request bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Issue #622: validate the body-size overrides once, at boot. A malformed
  // value fails the start-up loudly instead of throwing inside the body parser
  // on every request (or, worse, being silently coerced to a wrong limit).
  byteLimitEnvValue('MAX_JSON_BODY_BYTES');
  byteLimitEnvValue('MAX_URLENCODED_BODY_BYTES');

  // Attach raw buffer to req.rawBody so the Sep24WebhookGuard can verify
  // Webhook-Signature against the unmodified body bytes.
  //
  // Issue #622: `limit` is now explicit (1 MB by default, 10 MB ceiling for a
  // route decorated with @MaxBodySize()) instead of relying on express's
  // implicit 100 kB default. The `verify` callback is unchanged and must stay
  // byte-for-byte identical: the anchor signs the exact raw bytes, so altering
  // or dropping it breaks SEP-24 webhook signature verification.
  app.use(
    express.json({
      limit: (req: IncomingMessage) =>
        resolveByteLimit(
          bodyLimitOverride(req),
          undefined,
          'MAX_JSON_BODY_BYTES',
          DEFAULT_JSON_BODY_LIMIT,
        ),
      verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  // URL-encoded bodies are ~1/3 larger than their JSON equivalent, so they get
  // a slightly larger default. The same MAX_URLENCODED_BODY_BYTES env override
  // and @MaxBodySize() ceiling apply.
  app.use(
    express.urlencoded({
      extended: true,
      limit: (req: IncomingMessage) =>
        resolveByteLimit(
          bodyLimitOverride(req),
          undefined,
          'MAX_URLENCODED_BODY_BYTES',
          DEFAULT_URLENCODED_BODY_LIMIT,
        ),
    }),
  );
  // Issue #622: the parsers above throw PayloadTooLargeError from inside the
  // Express stack, before Nest's exception layer exists, so an oversized body
  // would otherwise escape as express's default HTML error page (leaking the
  // parse error). This renders a 413 in the same JSON envelope the rest of the
  // API returns.
  app.use(createPayloadLimitErrorHandler());

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);
  app.enableShutdownHooks();
  registerGracefulShutdown(app, logger);

  // Issue #622: tightened the existing global pipe rather than adding a
  // second one. `whitelist`/`forbidNonWhitelisted` already reject undeclared
  // properties; `forbidUnknownValues` additionally rejects a DTO that carries
  // no class-validator metadata at all, which would otherwise be accepted
  // unvalidated. Only real DTO classes are validated — Nest's ValidationPipe
  // skips Object/Array/primitive metatypes, so the `Record<string, any>`
  // webhook payloads are unaffected.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new ValidationExceptionFilter());

  // Process any API key expirations missed while the worker was offline.
  const apiKeyExpirationService = app.get(ApiKeyExpirationService);
  await apiKeyExpirationService.expireApiKeys();

  const config = new DocumentBuilder()
    .setTitle('StellarAid API')
    .setDescription('API for StellarAid application')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/api/docs', app, document);

  if (process.env.NODE_ENV !== 'production') {
    const { createBullBoard } = await import('@bull-board/api');
    const { BullAdapter } = await import('@bull-board/api/bullAdapter');
    const { ExpressAdapter } = await import('@bull-board/express');
    const Queue = (await import('bull')).default;

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [
        new BullAdapter(new Queue('email')),
        new BullAdapter(new Queue('contract-events')),
        new BullAdapter(new Queue('analytics')),
      ],
      serverAdapter,
    });

    const expressApp = app.getHttpAdapter().getInstance();

    expressApp.use('/admin/queues', serverAdapter.getRouter());
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
