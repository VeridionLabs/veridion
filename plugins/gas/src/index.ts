import { FindingSeverity } from '@veridion/shared';
import type { IRulePlugin, PluginMetadata, AnalysisContext, FindingResult } from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'gas',
  name: 'Gas Optimization Detector',
  version: '1.0.0',
  description: 'Detects gas-inefficient patterns and suggests optimizations.',
  severity: FindingSeverity.GAS,
  category: 'GAS',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['gas', 'optimization', 'storage', 'memory', 'calldata', 'loop'],
};

export class GasPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    // Detect storage variables in loops
    if (/\bfor\s*\(/.test(context.sourceCode) && /\bstorage\b/.test(context.sourceCode)) {
      findings.push({
        pluginId: this.metadata.id,
        title: 'Storage Reads in Loop',
        description: 'Reading storage variables inside a loop is extremely gas-inefficient. Cache storage values in memory before the loop.',
        severity: FindingSeverity.GAS,
        filePath: `${context.contractName}.sol`,
        lineStart: 1,
        lineEnd: 1,
        codeSnippet: '',
        recommendation: 'Cache storage variables in memory variables before entering the loop.',
        confidence: 0.7,
        references: [],
      });
    }

    // Use of string for function params (use calldata)
    if (/\bfunction\s+\w+\s*\([^)]*\bstring\b(?!\s+(?:calldata|memory)\b)/g.test(context.sourceCode)) {
      findings.push({
        pluginId: this.metadata.id,
        title: 'Use calldata Instead of memory',
        description: 'Function parameters of type string/bytes/array should use calldata instead of memory when not modified.',
        severity: FindingSeverity.GAS,
        filePath: `${context.contractName}.sol`,
        lineStart: 1,
        lineEnd: 1,
        codeSnippet: '',
        recommendation: 'Change memory to calldata for read-only function parameters.',
        confidence: 0.85,
        references: [],
      });
    }

    // ++i vs i++
    if (/\bi\+\+\b/.test(context.sourceCode)) {
      findings.push({
        pluginId: this.metadata.id,
        title: 'Use ++i Instead of i++',
        description: 'Using ++i is slightly more gas-efficient than i++ as it avoids creating a temporary variable.',
        severity: FindingSeverity.GAS,
        filePath: `${context.contractName}.sol`,
        lineStart: 1,
        lineEnd: 1,
        codeSnippet: '',
        recommendation: 'Replace i++ with ++i in loops.',
        confidence: 0.6,
        references: [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `Gas optimization: ${finding.recommendation}`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language);
  }
}
