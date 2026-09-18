import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (this.configService.get<boolean>('app.mockMode', false)) {
      return;
    }

    try {
      await this.$connect();
      this.logger.log('Prisma connected successfully');
    } catch (error) {
      const startupMode = this.configService.get<'fail-fast' | 'warn'>(
        'database.startupMode',
        'warn',
      );
      const reason = (error as Error).message;

      if (startupMode === 'fail-fast') {
        this.logger.error(`Prisma connection failed at startup: ${reason}`);
        throw error;
      }

      this.logger.warn(`Prisma connection skipped at startup: ${reason}`);
    }  }
}
