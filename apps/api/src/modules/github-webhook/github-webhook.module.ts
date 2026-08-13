import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService],
  exports: [GithubWebhookService],
})
export class GithubWebhookModule {}
