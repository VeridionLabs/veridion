import { ReportFormat } from '@veridion/shared';
import type { ReportData, ReportFormatter } from '../report-generator';

export class JsonFormatter implements ReportFormatter {
  readonly format = ReportFormat.JSON;

  generate(data: ReportData): string {
    return JSON.stringify(
      {
        auditId: data.auditId,
        projectName: data.projectName,
        contractName: data.contractName,
        contractHash: data.contractHash,
        chain: data.chain,
        language: data.language,
        securityScore: data.securityScore,
        findings: data.findings.map((f) => ({
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
        aiSummary: data.aiSummary,
        generatedAt: data.generatedAt.toISOString(),
        auditorName: data.auditorName,
        version: data.version,
      },
      null,
      2,
    );
  }
}
