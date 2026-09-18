import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ExportAuthModule } from './auth';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { ExportModule } from './export/export.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('throttle.default.ttlMs', 60_000),
            limit: configService.get<number>('throttle.default.limit', 120),
            blockDuration: configService.get<number>('throttle.default.blockDurationMs', 120_000),
          },
        ],
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'warn',
        autoLogging: false,
        quietReqLogger: true,
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                },
              }
            : undefined,
        redact: ['req.headers.authorization'],
      },
    }),
    DatabaseModule,
    ...(process.env.MOCK_MODE === 'true' ? [] : [QueueModule]),
    ExportAuthModule,
    ExportModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ExportServiceAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === 'true';
    if (enableRequestLogs) {
      consumer.apply(RequestLoggingMiddleware).forRoutes('*');
    }
  }
}