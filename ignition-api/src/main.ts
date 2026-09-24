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

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;
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

  // Attach raw buffer to req.rawBody so the Sep24WebhookGuard can verify
  // Webhook-Signature against the unmodified body bytes.
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);
  app.enableShutdownHooks();
  registerGracefulShutdown(app, logger);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
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
