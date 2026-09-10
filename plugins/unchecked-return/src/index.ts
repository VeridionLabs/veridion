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
    'Detects low-level calls (address.call, address.send, address.delegatecall) whose boolean return value is ignored. Silently ignoring a failed call can leave the contract in an inconsistent state.',
  severity: FindingSeverity.MEDIUM,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'low-level-call', 'send', 'call', 'delegatecall', 'error-handling'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/',
  ],
};

interface CallPattern {
  readonly kind: 'call' | 'send' | 'delegatecall';
  readonly regex: RegExp;
}

const CALL_PATTERNS: readonly CallPattern[] = [
  // .call(...) and .call{value: ...}(...)
  { kind: 'call', regex: /\.call\s*[({]/ },
  // .delegatecall(...)
  { kind: 'delegatecall', regex: /\.delegatecall\s*\(/ },
  // .send(...)
  { kind: 'send', regex: /\.send\s*\(/ },
];

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || this.isComment(line)) continue;

      for (const pattern of CALL_PATTERNS) {
        const match = pattern.regex.exec(line);
        if (!match) continue;
        // Only report the first matching kind on a given line to avoid duplicates
        // (e.g. ".call" also appearing inside a longer expression).
        if (this.isReturnChecked(line, match.index)) break;

        findings.push({
          pluginId: this.metadata.id,
          title: `Unchecked return value from low-level ${pattern.kind}()`,
          description:
            `The return value of \`${pattern.kind}()\` is not checked. Low-level calls do not ` +
            'revert on failure; they return a boolean indicating success. Ignoring it means a ' +
            'failed transfer or call is treated as a success, potentially corrupting contract state.',
          severity: this.metadata.severity,
          filePath: `${context.contractName}.sol`,
          lineStart: i + 1,
          lineEnd: i + 1,
          codeSnippet: line.trim(),
          recommendation:
            'Capture the boolean result and validate it, e.g. `(bool success, ) = target.call(...); ' +
            'require(success, "call failed");`.',
          confidence: 0.8,
          references: this.metadata.references ?? [],
        });
        break;
      }
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the unchecked return value at ${finding.filePath}:${finding.lineStart}:

Low-level calls (\`call\`, \`send\`, \`delegatecall\`) return a boolean success flag instead of
reverting. Always capture and check it:

\`\`\`solidity
// Unsafe: return value ignored
recipient.send(amount);
recipient.call{value: amount}("");

// Safe: return value checked
require(recipient.send(amount), "send failed");

(bool success, ) = recipient.call{value: amount}("");
require(success, "call failed");
\`\`\`

Prefer \`call\` over \`send\`/\`transfer\` for value transfers, and always guard the result with
\`require(success)\`. For plain Ether transfers that must revert on failure, \`transfer()\` is also
acceptable because it reverts automatically.`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }

  /**
   * Determine whether the boolean return value of a low-level call is consumed.
   * We inspect the code preceding the call on the same line: an assignment,
   * destructuring, or use inside a control/condition expression counts as checked.
   */
  private isReturnChecked(line: string, callIndex: number): boolean {
    const before = line.slice(0, callIndex);

    // Assigned to a variable or destructured: `bool ok = a.send(...)`, `(bool ok, ) = a.call(...)`
    if (/[=]\s*$/.test(before) || /\)\s*=\s*$/.test(before) || /=\s*[\w.]*$/.test(before)) {
      return true;
    }

    // Used inside require/assert/if/while/return or a boolean expression.
    if (/\b(require|assert|if|while|return)\s*\(?[^;]*$/.test(before)) {
      return true;
    }
    if (/(&&|\|\||!)\s*[\w.]*$/.test(before)) {
      return true;
    }

    return false;
  }

  private isComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }
}
