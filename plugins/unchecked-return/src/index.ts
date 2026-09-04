import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'unchecked-return-value',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description:
    'Detects low-level .call(), .send(), and .delegatecall() invocations whose boolean success value is not checked.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'call', 'send', 'delegatecall', 'require'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/',
  ],
};

export class UncheckedReturnValuePlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Only look at lines containing low-level calls
      if (!this.hasLowLevelCall(trimmed)) continue;

      // Check if this is a .transfer() - it reverts on failure, so it's safe
      if (this.isTransferCall(trimmed)) continue;

      // Check if the call result is being checked
      if (this.isReturnValueChecked(trimmed, lines, i)) continue;

      const member = this.getCallMember(trimmed);
      if (!member) continue;

      findings.push({
        pluginId: this.metadata.id,
        title: `Unchecked return value from .${member}()`,
        description:
          `The .${member}() call on line ${i + 1} does not check its boolean return value. ` +
          'If the call fails, execution continues as if it succeeded, which can lead to ' +
          'lost funds or inconsistent contract state.',
        severity: this.metadata.severity,
        filePath: `${context.contractName}.sol`,
        lineStart: i + 1,
        lineEnd: i + 1,
        codeSnippet: trimmed.slice(0, 200),
        recommendation:
          `Capture and check the return value using the require(success) pattern: ` +
          `"(bool success, ) = target.${member}(...); require(success, \"${member} failed\");"`,
        confidence: 0.9,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `Fix: ${finding.recommendation}`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language);
  }

  private hasLowLevelCall(line: string): boolean {
    return /\.call\s*\{|\.call\s*\(|\.send\s*\(|\.delegatecall\s*\(/.test(line);
  }

  private isTransferCall(line: string): boolean {
    return /\.transfer\s*\(/.test(line);
  }

  private getCallMember(line: string): string | null {
    if (/\.call\s*\{/.test(line) || /\.call\s*\(/.test(line)) return 'call';
    if (/\.send\s*\(/.test(line)) return 'send';
    if (/\.delegatecall\s*\(/.test(line)) return 'delegatecall';
    return null;
  }

  private isReturnValueChecked(line: string, lines: string[], index: number): boolean {
    // Pattern 1: Directly wrapped in require() or if()
    if (/require\s*\([^)]*\.(call|send|delegatecall)/.test(line)) return true;
    if (/if\s*\([^)]*\.(call|send|delegatecall)/.test(line)) return true;

    // Pattern 2: Assigned to a variable
    const assignMatch = line.match(/(?:bool\s+)?(\w+)\s*=\s*(?:[^;]*\.)?(?:call|send|delegatecall)/);
    if (assignMatch) {
      const varName = assignMatch[1] ?? '';
      if (!varName) return false;

      const checkWindow = lines.slice(index + 1, index + 5).join('\n');
      if (new RegExp(`require\\s*\\(\\s*${varName}`).test(checkWindow)) return true;
      if (new RegExp(`if\\s*\\(\\s*!?\\s*${varName}`).test(checkWindow)) return true;
      return false;
    }

    // Pattern 3: Tuple destructuring
    const tupleMatch = line.match(/\(bool\s+(\w+)\s*,/);
    if (tupleMatch) {
      const varName = tupleMatch[1] ?? '';
      if (!varName) return false;

      const checkWindow = lines.slice(index + 1, index + 5).join('\n');
      if (new RegExp(`require\\s*\\(\\s*${varName}`).test(checkWindow)) return true;
      if (new RegExp(`if\\s*\\(\\s*!?\\s*${varName}`).test(checkWindow)) return true;
      return false;
    }

    return false;
  }
}

export default UncheckedReturnValuePlugin;
