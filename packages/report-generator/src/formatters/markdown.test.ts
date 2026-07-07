import { describe, it, expect } from 'vitest';
import { MarkdownFormatter } from './markdown.formatter';
import { FindingSeverity, ReportFormat } from '@veridion/shared';
import type { ReportData } from '../report-generator';

describe('MarkdownFormatter', () => {
  const formatter = new MarkdownFormatter();

  const sampleData: ReportData = {
    auditId: 'test-audit-1',
    projectName: 'TestDeFi',
    contractName: 'TestContract',
    contractHash: '0xabcdef',
    chain: 'ethereum',
    language: 'solidity',
    securityScore: 85,
    findings: [
      {
        id: 'finding-1',
        auditId: 'test-audit-1',
        pluginId: 'reentrancy',
        title: 'Reentrancy Risk',
        description: 'External call before state update',
        severity: FindingSeverity.CRITICAL,
        filePath: 'TestContract.sol',
        lineStart: 42,
        lineEnd: 45,
        codeSnippet: '.call{value: amount}("")',
        recommendation: 'Use checks-effects-interactions',
        aiSummary: 'High risk reentrancy pattern detected',
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    generatedAt: new Date(),
    version: '1.0.0',
  };

  it('should have MARKDOWN format', () => {
    expect(formatter.format).toBe(ReportFormat.MARKDOWN);
  });

  it('should generate a report with project name', () => {
    const report = formatter.generate(sampleData);
    expect(report).toContain('TestDeFi');
  });

  it('should include security score', () => {
    const report = formatter.generate(sampleData);
    expect(report).toContain('85/100');
  });

  it('should include finding details', () => {
    const report = formatter.generate(sampleData);
    expect(report).toContain('Reentrancy Risk');
    expect(report).toContain('CRITICAL');
  });
});
