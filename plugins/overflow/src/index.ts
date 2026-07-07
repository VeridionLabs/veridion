import { FindingSeverity } from '@veridion/shared';
import type { IRulePlugin, PluginMetadata, AnalysisContext, FindingResult } from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'overflow',
  name: 'Integer Overflow/Underflow Detector',
  version: '1.0.0',
  description: 'Detects potential integer overflow/underflow issues, especially in Solidity <0.8.0 without SafeMath.',
  severity: FindingSeverity.HIGH,
  category: 'ARITHMETIC',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['overflow', 'underflow', 'arithmetic', 'safemath', 'unchecked'],
};

export class OverflowPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    // Check for unchecked blocks
    const uncheckedRegex = /\bunchecked\s*\{/g;
    let match;
    while ((match = uncheckedRegex.exec(context.sourceCode)) !== null) {
      findings.push({
        pluginId: this.metadata.id,
        title: 'Unchecked Arithmetic Block',
        description: 'Arithmetic inside unchecked blocks bypasses overflow/underflow protection. Verify these operations are safe.',
        severity: FindingSeverity.MEDIUM,
        filePath: `${context.contractName}.sol`,
        lineStart: 1,
        lineEnd: 1,
        codeSnippet: context.sourceCode.slice(match.index, match.index + 100),
        recommendation: 'Ensure arithmetic in unchecked blocks is safe from overflow/underflow, or remove the unchecked block.',
        confidence: 0.7,
        references: [],
      });
    }

    // Pre-0.8.0 without SafeMath
    const versionMatch = context.sourceCode.match(/pragma\s+solidity\s+[\^]?([0-9.]+)/);
    if (versionMatch) {
      const version = parseFloat(versionMatch[1]!);
      if (version < 0.8 && !/SafeMath/.test(context.sourceCode)) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'No Overflow Protection',
          description: `Solidity ${versionMatch[1]} does not have built-in overflow protection and SafeMath is not used.`,
          severity: FindingSeverity.CRITICAL,
          filePath: `${context.contractName}.sol`,
          lineStart: 1,
          lineEnd: 1,
          codeSnippet: '',
          recommendation: 'Upgrade to Solidity >=0.8.0 or use OpenZeppelin SafeMath.',
          confidence: 0.95,
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
