import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './common/prisma/prisma.module';
import { AiModule } from './modules/ai/ai.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuditsModule } from './modules/audits/audits.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReportsModule } from './modules/reports/reports.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379'),
        },
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    AuditsModule,
    ReportsModule,
    AiModule,
    ApiKeysModule,
    BlockchainModule,
    NotificationsModule,
  ],
})
export class AppModule {}
