import { ReportFormat } from '@veridion/shared';

import type { ReportData, ReportFormatter } from '../report-generator';

export class MarkdownFormatter implements ReportFormatter {
  readonly format = ReportFormat.MARKDOWN;

  generate(data: ReportData): string {
    const lines: string[] = [
      `# Veridion Security Audit Report`,
      '',
      `**Project:** ${data.projectName}`,
      `**Contract:** ${data.contractName}`,
      `**Chain:** ${data.chain}`,
      `**Language:** ${data.language}`,
      `**Security Score:** ${data.securityScore}/100`,
      `**Generated:** ${data.generatedAt.toISOString()}`,
      `**Auditor:** ${data.auditorName ?? 'Veridion AI'}`,
      '',
      '---',
      '',
    ];

    if (data.aiSummary) {
      lines.push('## Executive Summary', '', data.aiSummary, '', '---', '');
    }

    lines.push('## Findings Summary', '');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');

    const severityCounts = this.countBySeverity(data.findings);
    for (const [severity, count] of Object.entries(severityCounts)) {
      lines.push(`| ${severity} | ${count} |`);
    }

    lines.push('', '---', '', '## Detailed Findings', '');

    for (let i = 0; i < data.findings.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const finding = data.findings[i]!;
      lines.push(
        `### ${i + 1}. ${finding.title}`,
        '',
        `**Severity:** ${finding.severity}`,
        `**File:** ${finding.filePath}:${finding.lineStart}-${finding.lineEnd}`,
        `**Plugin:** ${finding.pluginId}`,
        '',
        '**Description:**',
        finding.description,
        '',
      );

      if (finding.codeSnippet) {
        lines.push('**Code:**', '', '```solidity', finding.codeSnippet, '```', '');
      }

      if (finding.recommendation) {
        lines.push('**Recommendation:**', finding.recommendation, '');
      }

      if (finding.aiSummary) {
        lines.push('**AI Analysis:**', finding.aiSummary, '');
      }

      lines.push('---', '');
    }

    return lines.join('\n');
  }

  private countBySeverity(findings: ReportData['findings']): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of findings) {
      counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    }
    return counts;
  }
}
