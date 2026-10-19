import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

function buildTransports(env: string, level: string): winston.transport[] {
  if (env === 'production') {
    return [
      new winston.transports.Console({
        format: combine(errors({ stack: true }), timestamp(), json()),
      }),
    ];
  }

  return [
    new winston.transports.Console({
      format: combine(
        errors({ stack: true }),
        colorize({ all: true }),
        simple(),
      ),
    }),
  ];
}

@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('NODE_ENV', 'development');
        const level = config.get<string>(
          'LOG_LEVEL',
          env === 'production' ? 'info' : 'debug',
        );

        return {
          level,
          transports: buildTransports(env, level),
        };
      },
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
