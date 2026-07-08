import type { Prisma } from '@prisma/client';

export type TransactionClient = Prisma.TransactionClient;
export type PrismaTx = Omit<Prisma.TransactionClient, '$transaction'>;
