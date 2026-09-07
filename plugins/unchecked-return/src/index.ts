import { FindingSeverity } from '@veridion/shared';
import type {
  IRulePlugin,
  PluginMetadata,
  AnalysisContext,
  FindingResult,
} from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description:
    'Detects .call(), .send(), and .delegatecall() where the return value is not checked.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'call', 'send', 'delegatecall'],
};

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const match = line.match(/\.(call|send|delegatecall)\s*(?:\{[^}]*\})?\s*\(/);
      if (!match) continue;

      const nearby = lines.slice(i, i + 3).join('\n');
      const checked = /require\s*\(\s*success/.test(nearby) || /require\s*\(/.test(line);

      if (!checked) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'Unchecked Return Value',
          description: `Return value of .${match[1]}() is not checked. Failed calls continue silently.`,
          severity: this.metadata.severity,
          filePath: `${context.contractName}.sol`,
          lineStart: i + 1,
          lineEnd: i + 1,
          codeSnippet: line.trim(),
          recommendation: 'Check the return value with require(success).',
          confidence: 0.85,
          references: [],
        });
      }
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return finding.recommendation;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language);
  }
}
