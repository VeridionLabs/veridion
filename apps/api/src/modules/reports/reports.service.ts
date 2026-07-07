import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { logger } from '@veridion/logger';
import type { GenerateReportDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(userId: string, dto: GenerateReportDto) {
    const audit = await this.prisma.db.audit.findUnique({
      where: { id: dto.auditId },
      include: {
        project: { select: { name: true, userId: true } },
        findings: { orderBy: { severity: 'asc' } },
      },
    });

    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.project.userId !== userId) throw new ForbiddenException('Access denied');

    logger.info({ auditId: dto.auditId, format: dto.format }, 'Generating report');

    const report = {
      auditId: audit.id,
      projectName: audit.project.name,
      securityScore: audit.securityScore ?? 0,
      findings: audit.findings.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        codeSnippet: f.codeSnippet,
        recommendation: f.recommendation,
        aiSummary: f.aiSummary,
      })),
      format: dto.format,
      generatedAt: new Date().toISOString(),
    };

    await this.prisma.db.audit.update({
      where: { id: dto.auditId },
      data: { reportHash: `report-${dto.auditId}` },
    });

    return report;
  }

  async getReport(auditId: string, userId: string) {
    const audit = await this.prisma.db.audit.findUnique({
      where: { id: auditId },
      include: {
        project: { select: { name: true, userId: true } },
        findings: true,
      },
    });

    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.project.userId !== userId) throw new ForbiddenException('Access denied');

    return {
      auditId: audit.id,
      projectName: audit.project.name,
      securityScore: audit.securityScore,
      findings: audit.findings,
      reportHash: audit.reportHash,
      generatedAt: audit.completedAt,
    };
  }
}
