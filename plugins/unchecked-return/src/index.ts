import type { AnalysisContext, FindingResult, IRulePlugin, PluginMetadata } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description: 'Detects low-level Solidity calls whose success return value is ignored.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'call', 'send', 'delegatecall', 'transfer', 'swc-104'],
  author: 'Veridion',
  references: ['https://swcregistry.io/docs/SWC-104'],
};

const callPattern = /\.(call|send|delegatecall|transfer)\s*(?:\{[^}]*\})?\s*\(/g;
const checkedExpression = /\b(?:require|assert|if)\s*\([^;]*\.(?:call|send|delegatecall|transfer)\b/;
const assignedResult = /(?:^|[;(])\s*(?:\([^)]*\)|(?:bool|bytes(?:\s+memory)?|uint(?:\d+)?|int(?:\d+)?|address|bytes\d+)\s+\w+)\s*=\s*[^;]*\.(?:call|send|delegatecall|transfer)\b/;

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // no initialization required
  }

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (!this.supportsContext(context)) return [];

    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;

      for (const match of line.matchAll(callPattern)) {
        const method = match[1];
        if (!method || this.isChecked(line)) continue;

        findings.push({
          pluginId: this.metadata.id,
          title: 'Unchecked Return Value',
          description: 'The return value from .' + method + '() is ignored. A failed low-level call may leave the contract in an unsafe state.',
          severity: this.metadata.severity,
          filePath: context.contractName.endsWith('.sol') ? context.contractName : context.contractName + '.sol',
          lineStart: index + 1,
          lineEnd: index + 1,
          codeSnippet: trimmed,
          recommendation: 'Capture the boolean result and enforce require(success) before continuing.',
          confidence: method === 'transfer' ? 0.88 : 0.97,
          references: this.metadata.references ?? [],
        });
      }
    });

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return 'Capture the call result before continuing, then use require(success) (or an equivalent explicit error path) at ' + finding.filePath + ':' + finding.lineStart + '.';
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.chains.includes(context.chain) && this.metadata.languages.includes(context.language);
  }

  private isChecked(line: string): boolean {
    return checkedExpression.test(line) || assignedResult.test(line);
  }
}
