import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ExportModule } from './export/export.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { ExportAuthModule } from './auth';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: false,
        quietReqLogger: true,
        redact: ['req.headers.authorization'],
      },
    }),
    DatabaseModule,
    ...(process.env.MOCK_MODE === 'true' ? [] : [QueueModule]),
    ExportAuthModule,
    ExportModule,
  ],
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {
    // Middleware configuration for standalone export service.
  }
}
