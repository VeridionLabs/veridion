import type { Prisma } from './generated/client';

export type TransactionClient = Prisma.TransactionClient;
export type PrismaTx = Omit<Prisma.TransactionClient, '$transaction'>;
