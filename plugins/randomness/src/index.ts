import { FindingSeverity } from '@veridion/shared';
import type { IRulePlugin, PluginMetadata, AnalysisContext, FindingResult } from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'randomness',
  name: 'Weak Randomness Detector',
  version: '1.0.0',
  description: 'Detects weak sources of randomness (block.timestamp, block.difficulty, blockhash, etc.).',
  severity: FindingSeverity.HIGH,
  category: 'RANDOMNESS',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['randomness', 'blockhash', 'timestamp', 'predictable', 'miner-manipulation'],
};

export class RandomnessPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const weakSources = [
      { pattern: /\bblock\.timestamp\b/g, name: 'block.timestamp' },
      { pattern: /\bblock\.difficulty\b/g, name: 'block.difficulty' },
      { pattern: /\bblock\.number\b/g, name: 'block.number' },
      { pattern: /\bblockhash\b/g, name: 'blockhash()' },
      { pattern: /\bblock\.coinbase\b/g, name: 'block.coinbase' },
      { pattern: /\bblock\.gaslimit\b/g, name: 'block.gaslimit' },
      { pattern: /\bnow\b/g, name: 'now' },
    ];

    for (const source of weakSources) {
      let match;
      while ((match = source.pattern.exec(context.sourceCode)) !== null) {
        const line = context.sourceCode.slice(0, match.index).split('\n').length;
        findings.push({
          pluginId: this.metadata.id,
          title: `Weak Randomness Source: ${source.name}`,
          description: `${source.name} is predictable and can be manipulated by miners. Do not use for generating random values.`,
          severity: this.metadata.severity,
          filePath: `${context.contractName}.sol`,
          lineStart: line,
          lineEnd: line,
          codeSnippet: context.sourceCode.slice(Math.max(0, match.index - 30), match.index + 30).trim(),
          recommendation: 'Use Chainlink VRF or a commit-reveal scheme for on-chain randomness.',
          confidence: 0.9,
          references: ['https://docs.chain.link/vrf'],
        });
      }
    }

    return findings;
  }

  getFixRecommendation(): string {
    return 'Use Chainlink VRF or commit-reveal pattern for secure on-chain randomness.';
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language);
  }
}
