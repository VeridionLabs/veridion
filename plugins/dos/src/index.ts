import { FindingSeverity } from '@veridion/shared';
import type {
  IRulePlugin,
  PluginMetadata,
  AnalysisContext,
  FindingResult,
} from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'dos',
  name: 'Denial of Service Detector',
  version: '1.0.0',
  description:
    'Detects patterns vulnerable to Denial of Service attacks including unbounded loops, external call failures, and gas griefing.',
  severity: FindingSeverity.HIGH,
  category: 'DOS',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['dos', 'griefing', 'gas', 'unbounded-loop', 'block-gas-limit'],
};

export class DosPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    // Unbounded loops over dynamic arrays
    if (/\bfor\s*\(/.test(context.sourceCode)) {
      const loopRegex = /\bfor\s*\(\s*uint\d*\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*(\w+)\.length/g;
      let match;
      while ((match = loopRegex.exec(context.sourceCode)) !== null) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'Unbounded Loop - Potential DOS',
          description: `Loop iterating over ${match[1]}.length which grows indefinitely can exceed block gas limit.`,
          severity: FindingSeverity.HIGH,
          filePath: `${context.contractName}.sol`,
          lineStart: 1,
          lineEnd: 1,
          codeSnippet: match[0],
          recommendation:
            'Add a maximum limit to array size or use pull-over-push pattern for payments.',
          confidence: 0.7,
          references: [],
        });
      }
    }

    // External call failure without handling
    if (/\.call\s*\{/.test(context.sourceCode)) {
      const callRegex = /\.call\s*\{[^}]*\}\s*\(\s*""?\s*\)/g;
      let callMatch;
      while ((callMatch = callRegex.exec(context.sourceCode)) !== null) {
        const afterCall = context.sourceCode.slice(callMatch.index, callMatch.index + 200);
        if (!/require\s*\(\s*success/.test(afterCall)) {
          findings.push({
            pluginId: this.metadata.id,
            title: 'Unchecked External Call',
            description:
              'External call result not checked. Failed calls could silently revert or cause unexpected behavior.',
            severity: FindingSeverity.MEDIUM,
            filePath: `${context.contractName}.sol`,
            lineStart: 1,
            lineEnd: 1,
            codeSnippet: callMatch[0],
            recommendation:
              'Check the return value of external calls with require(success, "call failed").',
            confidence: 0.8,
            references: [],
          });
        }
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
