import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description:
    'Detects unchecked return values from low-level calls (.call, .send, .delegatecall, .staticcall). These calls return a bool indicating success, but if not checked, failed calls can go unnoticed.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity', 'vyper'],
  tags: [
    'unchecked-return',
    'low-level-call',
    'call',
    'send',
    'delegatecall',
    'staticcall',
  ],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/solidity-specific/unchecked-low-level-calls/',
  ],
};

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    const callPatterns = [
      { regex: /\.call\s*(?:\{[^}]*\})?\s*\(/g, type: '.call()' },
      { regex: /\.send\s*\(/g, type: '.send()' },
      { regex: /\.delegatecall\s*\(/g, type: '.delegatecall()' },
      { regex: /\.staticcall\s*\(/g, type: '.staticcall()' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*')
      ) {
        continue;
      }

      for (const { regex, type } of callPatterns) {
        regex.lastIndex = 0;
        if (!regex.test(line)) continue;

        if (!this.isReturnValueChecked(line, context.sourceCode, i)) {
          findings.push({
            pluginId: this.metadata.id,
            title: `Unchecked Return Value from ${type}`,
            description: `The return value of ${type} is not checked. Low-level calls return a bool indicating success. If not checked, failed calls can go unnoticed, leading to silent failures and potential security issues.`,
            severity: this.metadata.severity,
            filePath: `${context.contractName}.sol`,
            lineStart: i + 1,
            lineEnd: i + 1,
            codeSnippet: line.trim(),
            recommendation: `Check the return value: require(success, "Call failed"); or if (!success) { revert("Call failed"); }`,
            confidence: 0.85,
            references: this.metadata.references ?? [],
          });
        }
      }
    }

    return findings;
  }

  private isReturnValueChecked(
    line: string,
    sourceCode: string,
    lineIndex: number,
  ): boolean {
    const hasInlineCheck = /\b(require|if|assert)\b/.test(line);
    if (hasInlineCheck) return true;

    const capturesResult = /\(bool\s+(\w+)/.test(line);
    if (capturesResult) {
      const match = line.match(/\(bool\s+(\w+)/);
      if (match?.[1]) {
        const varName = match[1];
        const nextLines = sourceCode
          .split('\n')
          .slice(lineIndex + 1, lineIndex + 6);
        for (const nextLine of nextLines) {
          if (
            nextLine.includes(varName) &&
            /\b(require|if|assert|revert)\b.test(nextLine)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `Check the return value of the low-level call. Example:
  (bool success, ) = msg.sender.call{value: amount}("");
  require(success, "Call failed");`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}
