import type { Prisma, PrismaClient } from '@prisma/client';

export type TransactionClient = Prisma.TransactionClient;
export type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
