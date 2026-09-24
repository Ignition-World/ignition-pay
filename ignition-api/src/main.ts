import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { initSentry } from './common/sentry/sentry.middleware';
import { ValidationExceptionFilter } from './common/validation-exception.filter';
import { ApiKeyExpirationService } from './api-keys/api-key-expiration.service';
import type { Request, Response } from 'express';
import * as express from 'express';

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

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

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
