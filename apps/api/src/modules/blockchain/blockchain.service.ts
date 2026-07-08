import { Injectable, NotFoundException } from '@nestjs/common';
import { logger } from '@veridion/logger';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { VerifyAuditDto } from './dto/blockchain.dto';

@Injectable()
export class BlockchainService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(_userId: string, dto: VerifyAuditDto) {
    const audit = await this.prisma.db.audit.findUnique({ where: { id: dto.auditId } });
    if (!audit) throw new NotFoundException('Audit not found');

    logger.info(
      { auditId: dto.auditId, walletAddress: dto.walletAddress },
      'Blockchain verification requested',
    );

    // In production, this would submit to Stellar Soroban
    const transactionHash = `stellar-tx-${Date.now()}`;

    await this.prisma.db.audit.update({
      where: { id: dto.auditId },
      data: { transactionHash, chainStatus: 'PENDING', status: 'VERIFIED' },
    });

    return {
      transactionHash,
      status: 'PENDING',
      auditId: dto.auditId,
    };
  }

  async getVerification(auditId: string) {
    const audit = await this.prisma.db.audit.findUnique({
      where: { id: auditId },
      select: {
        id: true,
        transactionHash: true,
        chainStatus: true,
        securityScore: true,
        reportHash: true,
      },
    });

    if (!audit) throw new NotFoundException('Audit not found');

    return {
      auditId: audit.id,
      transactionHash: audit.transactionHash,
      chainStatus: audit.chainStatus,
      securityScore: audit.securityScore,
      reportHash: audit.reportHash,
    };
  }
}
