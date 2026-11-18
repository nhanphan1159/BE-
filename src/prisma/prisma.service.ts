import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Connected to PostgreSQL database successfully.');
    } catch {
      this.logger.warn(
        '⚠️ Could not connect to PostgreSQL at localhost:5432. ' +
        'Please ensure Docker Desktop is running and start the container with: "docker compose up -d", ' +
        'then push the schema with: "cd server && pnpm prisma db push".'
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
