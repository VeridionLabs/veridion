import type { AuditFinding } from '@veridion/shared';
import { ReportFormat } from '@veridion/shared';
import { logger } from '@veridion/logger';

export interface ReportData {
  auditId: string;
  projectName: string;
  projectDescription?: string;
  contractName: string;
  contractHash: string;
  chain: string;
  language: string;
  securityScore: number;
  findings: AuditFinding[];
  aiSummary?: string;
  generatedAt: Date;
  auditorName?: string;
  version: string;
}

export interface ReportFormatter {
  format: ReportFormat;
  generate(data: ReportData): string;
}

export class ReportGenerator {
  private formatters: Map<ReportFormat, ReportFormatter> = new Map();

  registerFormatter(formatter: ReportFormatter): void {
    this.formatters.set(formatter.format, formatter);
    logger.info({ format: formatter.format }, 'Report formatter registered');
  }

  generate(data: ReportData, format: ReportFormat): string {
    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new Error(`No formatter registered for format: ${format}`);
    }
    logger.info({ auditId: data.auditId, format }, 'Generating report');
    return formatter.generate(data);
  }

  generateAll(data: ReportData): Record<string, string> {
    const reports: Record<string, string> = {};
    for (const [format, formatter] of this.formatters) {
      reports[format] = formatter.generate(data);
    }
    return reports;
  }
}
