import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditsController } from './audits.controller';
import { AuditsProcessor } from './audits.processor';
import { AUDIT_QUEUE_NAME } from './audits.queue';
import { AuditsService } from './audits.service';

@Module({
  imports: [BullModule.registerQueue({ name: AUDIT_QUEUE_NAME })],
  controllers: [AuditsController],
  providers: [AuditsService, AuditsProcessor],
  exports: [AuditsService],
})
export class AuditsModule {}
