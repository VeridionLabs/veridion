import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const CONDITIONAL = /\b(if|require|while|assert|else\s+if)\b/;
const TIMESTAMP = /\bblock\.timestamp\b/;
const LEGACY_NOW = /(^|[^.\w])now([^.\w]|$)/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

export class TimestampPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata = {
    id: 'timestamp',
    name: 'Timestamp Dependence Detector',
    version: '0.1.0',
    description:
      'Detects reliance on block.timestamp or the legacy now keyword in conditional logic.',
    severity: FindingSeverity.LOW,
    category: 'TIMESTAMP',
    chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
    languages: ['solidity'],
    tags: ['timestamp', 'now', 'miner-manipulation', 'time'],
    author: 'walterwagner',
    references: [
      'https://swcregistry.io/docs/SWC-116',
      'https://consensys.github.io/smart-contract-best-practices/attacks/timestamp-dependence/',
    ],
  };

  async initialize(_config?: Record<string, unknown>): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const source = stripComments(context.sourceCode);
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !CONDITIONAL.test(line)) continue;

      const usesTimestamp = TIMESTAMP.test(line);
      const usesNow = LEGACY_NOW.test(line);
      if (!usesTimestamp && !usesNow) continue;

      const sourceName = usesTimestamp ? 'block.timestamp' : 'now';
      findings.push({
        pluginId: this.metadata.id,
        title: `Timestamp used in conditional logic (${sourceName})`,
        description:
          `${sourceName} can be manipulated by miners within a small window. ` +
          'Using it in if/require/while/assert conditions for critical logic is unsafe.',
        severity: FindingSeverity.LOW,
        filePath: `${context.contractName.replace(/\.sol$/i, '')}.sol`,
        lineStart: i + 1,
        lineEnd: i + 1,
        codeSnippet: line.trim(),
        recommendation:
          'Avoid timestamp checks for critical decisions. Prefer block.number with a delay, or an oracle. If a time bound is required, treat it as approximate and do not use it for randomness or as the sole access gate.',
        confidence: 0.85,
        references: this.metadata.references ?? [],
      });
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
