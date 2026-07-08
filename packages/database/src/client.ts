import { PrismaClient } from '@prisma/client';

interface PrismaGlobal {
  prisma?: PrismaClient;
}

const globalForPrisma = globalThis as unknown as PrismaGlobal;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const prisma =
  globalForPrisma.prisma ??
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  globalForPrisma.prisma = prisma;
}
