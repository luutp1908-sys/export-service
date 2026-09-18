import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ExportServiceAppModule } from './export-service-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ExportServiceAppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());

  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('app.apiPrefix', 'api');
  const swaggerPath = config.get<string>('app.swaggerPath', 'docs');
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const trustProxy = config.get<number>('app.trustProxy', 0);
  if (trustProxy > 0) {
    const httpAdapter = app.getHttpAdapter();
    const adapterInstance = httpAdapter.getInstance();
    if (adapterInstance && typeof adapterInstance.set === 'function') {
      adapterInstance.set('trust proxy', trustProxy);
    }
  }

  const configuredOrigin = config.get<string>('app.frontendOrigin', '');
  const localOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];
  const configuredOrigins = configuredOrigin
    ? configuredOrigin.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];
  const allowedOrigins = Array.from(new Set([...configuredOrigins, ...localOrigins]));

  const isProduction = config.get<string>('app.nodeEnv', 'development') === 'production';
  if (isProduction && configuredOrigins.length === 0) {
    throw new Error('FRONTEND_ORIGIN must be set in production for CORS allowlisting');
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isProduction) {
        if (configuredOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Template SaaS Export API')
    .setDescription('Export service API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = config.get<number>('app.port', 4100);
  app.use(cookieParser());
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();