import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { createDefaultPluginRegistry, Scanner } from '@veridion/scanner-core';
import type { AnalysisContext } from '@veridion/scanner-types';
import { AuditStatus } from '@veridion/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AUDIT_QUEUE_NAME, type ScanAuditJobData } from './audits.queue';

@Processor(AUDIT_QUEUE_NAME)
export class AuditsProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ScanAuditJobData>): Promise<void> {
    const { auditId, projectId, sourceCode } = job.data;
    this.logger.log(`Processing audit ${auditId} for project ${projectId}`);

    try {
      // ── Phase 1: SCANNING ──────────────────────────────────────────
      await this.updateAuditStatus(auditId, AuditStatus.SCANNING);
      await job.updateProgress(10);

      const project = await this.prisma.db.project.findUnique({
        where: { id: projectId },
        include: { contracts: true },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Build analysis context from project metadata and optional inline source
      const analysisSource =
        sourceCode ?? project.contracts.map((c) => c.sourceCode).join('\n') ?? '';

      const context: AnalysisContext = {
        contractName: project.name,
        sourceCode: analysisSource,
        chain: project.chain ?? 'ethereum',
        language: project.language ?? 'solidity',
        compilerVersion: null,
        metadata: {},
      };

      const registry = createDefaultPluginRegistry();
      const scanner = new Scanner(registry, { parallel: true });
      const scanResult = await scanner.scan(context);

      await job.updateProgress(50);

      // Persist findings
      if (scanResult.findings.length > 0) {
        await this.prisma.db.auditFinding.createMany({
          data: scanResult.findings.map((finding) => ({
            auditId,
            pluginId: finding.pluginId,
            title: finding.title,
            description: finding.description,
            severity: finding.severity,
            filePath: finding.filePath,
            lineStart: finding.lineStart,
            lineEnd: finding.lineEnd,
            codeSnippet: finding.codeSnippet ?? null,
            recommendation: finding.recommendation ?? null,
            confidence: finding.confidence ?? 1.0,
          })),
        });
      }

      this.logger.log(`Audit ${auditId}: scanner found ${scanResult.findings.length} findings`);

      await job.updateProgress(70);

      // ── Phase 2: AI_REVIEW ─────────────────────────────────────────
      await this.updateAuditStatus(auditId, AuditStatus.AI_REVIEW);

      const securityScore = this.calculateSecurityScore(scanResult.summary);

      await job.updateProgress(90);

      // ── Phase 3: COMPLETED ─────────────────────────────────────────
      await this.prisma.db.audit.update({
        where: { id: auditId },
        data: {
          status: AuditStatus.COMPLETED,
          securityScore,
          completedAt: new Date(),
        },
      });

      await job.updateProgress(100);
      this.logger.log(
        `Audit ${auditId} completed — score ${securityScore}, ${scanResult.findings.length} findings`,
      );
    } catch (error) {
      this.logger.error(`Audit ${auditId} failed`, error instanceof Error ? error.stack : error);

      await this.updateAuditStatus(
        auditId,
        AuditStatus.FAILED,
        error instanceof Error ? error.message : String(error),
      );

      throw error; // Re-throw so BullMQ retries
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async updateAuditStatus(
    auditId: string,
    status: AuditStatus,
    error?: string,
  ): Promise<void> {
    await this.prisma.db.audit.update({
      where: { id: auditId },
      data: {
        status,
        ...(status === AuditStatus.SCANNING ? { startedAt: new Date() } : {}),
        ...(error ? { error } : {}),
      },
    });
  }

  private calculateSecurityScore(summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    gas: number;
    informational: number;
  }): number {
    let score = 100;
    score -= summary.critical * 25;
    score -= summary.high * 15;
    score -= summary.medium * 8;
    score -= summary.low * 3;
    score -= summary.gas * 1;
    return Math.max(0, Math.min(100, score));
  }
}
