import { FindingSeverity } from '@veridion/shared';
import type { IRulePlugin, PluginMetadata, AnalysisContext, FindingResult } from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'oracle',
  name: 'Oracle Manipulation Detector',
  version: '1.0.0',
  description: 'Detects reliance on single oracles and potential price manipulation vulnerabilities.',
  severity: FindingSeverity.HIGH,
  category: 'ORACLE',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['oracle', 'price-manipulation', 'flash-loan', 'twap', 'chainlink'],
};

export class OraclePlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    // Spot price from Uniswap/AMM
    const ammPricePatterns = [
      /getReserves\s*\(/g,
      /\.getAmountsOut\s*\(/g,
      /\.getAmountsIn\s*\(/g,
      /\.quote\s*\(/g,
      /getSpotPrice\s*\(/g,
    ];

    for (const pattern of ammPricePatterns) {
      if (pattern.test(context.sourceCode)) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'Potential Oracle Manipulation',
          description: 'Using AMM spot prices can lead to oracle manipulation via flash loans or large trades.',
          severity: FindingSeverity.HIGH,
          filePath: `${context.contractName}.sol`,
          lineStart: 1,
          lineEnd: 1,
          codeSnippet: '',
          recommendation: 'Use Chainlink oracles or TWAP (Time-Weighted Average Price) instead of spot prices.',
          confidence: 0.8,
          references: ['https://docs.chain.link/data-feeds'],
        });
        break;
      }
    }

    // Single oracle dependency
    if (/Chainlink/.test(context.sourceCode)) {
      const hasAggregator = /latestRoundData\s*\(/.test(context.sourceCode);
      const hasStaleCheck = /stale/i.test(context.sourceCode) || /updatedAt/.test(context.sourceCode);
      const hasMinAnswer = /minAnswer|maxAnswer/.test(context.sourceCode);

      if (!hasAggregator && !hasStaleCheck) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'Missing Stale Price Check',
          description: 'Chainlink oracle usage detected without stale price validation.',
          severity: FindingSeverity.MEDIUM,
          filePath: `${context.contractName}.sol`,
          lineStart: 1,
          lineEnd: 1,
          codeSnippet: '',
          recommendation: 'Add stale price checks when using Chainlink oracles.',
          confidence: 0.7,
          references: [],
        });
      }

      if (context.chain !== 'ethereum' && !hasMinAnswer) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'Missing Oracle Circuit Breaker Check',
          description: 'Chainlink oracles on L2s should verify min/max answer values as an additional safety check.',
          severity: FindingSeverity.LOW,
          filePath: `${context.contractName}.sol`,
          lineStart: 1,
          lineEnd: 1,
          codeSnippet: '',
          recommendation: 'Add minAnswer/maxAnswer validation for L2 oracle reads.',
          confidence: 0.5,
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
