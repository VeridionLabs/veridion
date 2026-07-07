import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@veridion/database';
import type { PrismaClient } from '@prisma/client';
import { logger } from '@veridion/logger';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    this.client = prisma as PrismaClient;
  }

  get db(): PrismaClient {
    return this.client;
  }

  async onModuleInit() {
    logger.info('Connecting to database...');
    await this.client.$connect();
    logger.info('Database connected');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    logger.info('Database disconnected');
  }
}
