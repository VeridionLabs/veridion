import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { logger } from '@veridion/logger';
import type { AiChatDto } from './dto/ai.dto';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async chat(_userId: string, dto: AiChatDto) {
    const audit = await this.prisma.db.audit.findUnique({
      where: { id: dto.auditId },
      include: { findings: true },
    });

    if (!audit) throw new NotFoundException('Audit not found');

    logger.info({ auditId: dto.auditId }, 'AI chat requested');

    return {
      message: `Analysis for audit ${dto.auditId}: Found ${audit.findings.length} issues. ${dto.message}`,
      citations: [],
    };
  }
}
