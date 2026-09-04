import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'timestamp',
  name: 'Timestamp Dependence Detector',
  version: '1.0.0',
  description:
    'Detects reliance on block.timestamp or legacy now keyword for critical conditional logic and time checks.',
  severity: FindingSeverity.LOW,
  category: 'TIMESTAMP',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: [
    'timestamp',
    'block.timestamp',
    'now',
    'dependence',
    'miner-manipulation',
    'swc-116',
  ],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-116',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/solidity-specific/timestamp-dependence/',
  ],
};

export class TimestampPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    // Patterns for conditional logic checking
    const conditionalPatterns = [
      /\bif\s*\(/,
      /\brequire\s*\(/,
      /\bassert\s*\(/,
      /\bwhile\s*\(/,
      /\bfor\s*\(/,
      /[<>=!]=|[<>]/, // Comparison operators
      /\?.*:/, // Ternary
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmed = line.trim();

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Pattern 1: Legacy `now` keyword
      const nowMatch = /\bnow\b/.exec(trimmed);
      if (nowMatch) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'Legacy "now" Keyword Used',
          description:
            'Use of the legacy "now" keyword detected. "now" was deprecated in Solidity 0.7.0 and is an alias for block.timestamp, which can be manipulated by miners/validators.',
          severity: this.metadata.severity,
          filePath: `${context.contractName}.sol`,
          lineStart: i + 1,
          lineEnd: i + 1,
          codeSnippet: trimmed,
          recommendation:
            'Replace "now" with "block.timestamp" and ensure critical logic does not rely on short-interval timestamp checks.',
          confidence: 0.9,
          references: this.metadata.references ?? [],
        });
        continue;
      }

      // Pattern 2: block.timestamp in conditional logic or comparison
      if (/\bblock\.timestamp\b/.test(trimmed)) {
        const isConditional = conditionalPatterns.some((pattern) => pattern.test(trimmed));

        if (isConditional) {
          findings.push({
            pluginId: this.metadata.id,
            title: 'Timestamp Dependence in Conditional Logic',
            description:
              'block.timestamp is used in conditional logic or comparison operations. Block timestamps can be manipulated by validators/miners within approximately 15 seconds.',
            severity: this.metadata.severity,
            filePath: `${context.contractName}.sol`,
            lineStart: i + 1,
            lineEnd: i + 1,
            codeSnippet: trimmed,
            recommendation:
              'Avoid using block.timestamp for critical condition gates or random number seeds. If timing intervals are required, ensure time intervals exceed 15-900 seconds or use block numbers if block times are uniform.',
            confidence: 0.85,
            references: this.metadata.references ?? [],
          });
        }
      }
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To resolve timestamp dependence at ${finding.filePath}:${finding.lineStart}:
1. Be aware that block.timestamp can be manipulated by miners/validators within approximately 15 seconds.
2. Avoid using block.timestamp for direct equality comparisons (e.g. block.timestamp == targetTime).
3. If using timestamps for intervals, ensure intervals are sufficiently large (e.g. > 15 minutes) so minor drift does not alter game-theoretic outcomes.
4. For block intervals or sequencing, consider block.number instead of timestamps where applicable.
5. If used for randomness, replace with a verifiable randomness oracle like Chainlink VRF.`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}
