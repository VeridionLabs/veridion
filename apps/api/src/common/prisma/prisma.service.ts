import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@veridion/database';
import { logger } from '@veridion/logger';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    this.client = prisma;
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
