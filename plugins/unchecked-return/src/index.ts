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
    'Detects calls to .send(), .call(), and .delegatecall() where the return value is not checked.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'send', 'call', 'delegatecall', 'error-handling'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/attacks/unchecked-external-call/',
  ],
};

interface CallDescriptor {
  /** Source method invoked on the address type. */
  method: string;
  /** Human-readable name of the callee, used in finding titles. */
  label: string;
  /** How a failed call behaves when its return value is ignored. */
  failureMode: string;
  /** Severity assigned to findings for this call type. */
  severity: FindingSeverity;
}

const CALL_DESCRIPTORS: CallDescriptor[] = [
  {
    method: 'call',
    label: 'address.call()',
    failureMode:
      'A failed low-level .call() returns (bool, bytes) instead of reverting, so execution continues with an inconsistent contract state.',
    severity: FindingSeverity.HIGH,
  },
  {
    method: 'send',
    label: 'address.send()',
    failureMode:
      'A failed .send() returns false instead of reverting (and forwards only 2,300 gas), so the recipient may silently receive nothing.',
    severity: FindingSeverity.HIGH,
  },
  {
    method: 'delegatecall',
    label: 'address.delegatecall()',
    failureMode:
      'A failed .delegatecall() returns (bool, bytes) instead of reverting, letting execution continue as if the delegated logic had succeeded — potentially leading to storage corruption.',
    severity: FindingSeverity.CRITICAL,
  },
];

/** Matches `{ ... }` call options such as `{value: amount}` or `{gas: 10000}`. */
const CALL_OPTIONS = /(?:\s*\{[^}]*\})?/.source;

/** Matches `target.call(...)`, `payable(x).send{value: 1}(...)`, etc. */
const buildCallPattern = (method: string): RegExp =>
  new RegExp(`\\.\\s*${method}${CALL_OPTIONS}\\s*\\(`, 'g');

/** Replaces string literal contents with spaces, preserving column positions. */
function maskStrings(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (s) => {
    return ` ${' '.repeat(Math.max(0, s.length - 2))} `;
  });
}

interface LineCommentScan {
  /** Per-character flags: true when that column is inside a comment. */
  commented: boolean[];
  /** Whether the line leaves us inside an unterminated block comment. */
  inBlockAfter: boolean;
}

function scanLineForComments(line: string, inBlockStart: boolean): LineCommentScan {
  const masked = maskStrings(line);
  const commented: boolean[] = new Array<boolean>(masked.length).fill(false);
  let inBlock = inBlockStart;
  let i = 0;
  while (i < masked.length) {
    if (inBlock) {
      commented[i] = true;
      if (masked[i] === '*' && masked[i + 1] === '/') {
        commented[i + 1] = true;
        inBlock = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (masked[i] === '/' && masked[i + 1] === '/') {
      for (let j = i; j < masked.length; j++) commented[j] = true;
      break;
    }
    if (masked[i] === '/' && masked[i + 1] === '*') {
      commented[i] = true;
      commented[i + 1] = true;
      inBlock = true;
      i += 2;
      continue;
    }
    i += 1;
  }
  return { commented, inBlockAfter: inBlock };
}

/**
 * True when the statement containing the call (0-based line index) actually
 * consumes the boolean return value of the call.
 */
function isReturnValueChecked(lines: string[], callLine: number, method: string): boolean {
  // Patterns that bind and use the result: `(bool success, ) = x.call()`,
  // `bool ok = x.send()`, `if (x.call(...))`, `require(x.send(...))`,
  // `success = x.call()`, `return x.call()`.
  const checkedPatterns: RegExp[] = [
    new RegExp(`\\(\\s*bool\\s+[^)]*\\)\\s*=\\s*[^;=]*\\.\\s*${method}\\b`), // tuple destructuring
    new RegExp(`\\bbool\\s+\\w+\\s*=\\s*[^;=]*\\.\\s*${method}\\b`), // bool ok = x.send(...)
    new RegExp(`\\b(?:require|if|assert|while)\\s*\\([^;{)]*\\.\\s*${method}\\b`), // condition context
    new RegExp(`\\breturn\\b[^;]*\\.\\s*${method}\\b`), // returned directly
    new RegExp(`\\b\\w+\\s*=\\s*[^;=>]*\\.\\s*${method}${CALL_OPTIONS}\\s*\\(`), // assigned to var
  ];

  // The call may span multiple lines (e.g. abi encoding on its own line), so scan
  // the whole statement: current line plus continuation lines until a terminator.
  let statement = lines[callLine] ?? '';
  if (!/[;{}]/.test(statement)) {
    for (let i = callLine + 1; i < Math.min(callLine + 5, lines.length); i++) {
      const line = lines[i];
      if (!line) break;
      statement += ` ${line}`;
      if (/[;{}]/.test(line)) break;
    }
  }

  return checkedPatterns.some((pattern) => pattern.test(statement));
}

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // No initialization needed
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    // Precompute per-line comment information (handles // and /* */ across lines).
    const commentScans: LineCommentScan[] = [];
    const lineOffsets: number[] = [];
    let inBlock = false;
    let offset = 0;
    for (const line of lines) {
      const scan = scanLineForComments(line, inBlock);
      commentScans.push(scan);
      inBlock = scan.inBlockAfter;
      lineOffsets.push(offset);
      offset += line.length + 1;
    }

    for (const descriptor of CALL_DESCRIPTORS) {
      const pattern = buildCallPattern(descriptor.method);
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(context.sourceCode)) !== null) {
        const lineStart = context.sourceCode.slice(0, match.index).split('\n').length;
        const lineIndex = lineStart - 1;
        const rawLine = lines[lineIndex] ?? '';

        // Skip matches inside comments.
        const scan = commentScans[lineIndex];
        const column = match.index - (lineOffsets[lineIndex] ?? 0);
        if (scan && scan.commented[column]) continue;

        if (isReturnValueChecked(lines, lineIndex, descriptor.method)) continue;

        const snippet = rawLine.trim().length > 0 ? rawLine.trim() : match[0];

        findings.push({
          pluginId: this.metadata.id,
          title: `Unchecked Return Value from ${descriptor.label}`,
          description: `The return value of ${descriptor.label} is never checked. ${descriptor.failureMode} Verify the result with a require statement or handle the failure explicitly.`,
          severity: descriptor.severity,
          filePath: `${context.contractName}.sol`,
          lineStart,
          lineEnd: lineStart,
          codeSnippet: snippet.slice(0, 200),
          recommendation: this.buildRecommendation(descriptor.method),
          confidence: 0.9,
          references: this.metadata.references ?? [],
        });
      }
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the unchecked return value at ${finding.filePath}:${finding.lineStart}:

1. Capture the boolean result of the low-level call and check it with require:

\`\`\`solidity
(bool success, ) = target.call{value: amount}(data);
require(success, "Call failed");
\`\`\`

2. For .send(), prefer .call() with an explicit check instead:

\`\`\`solidity
(bool sent, ) = payable(recipient).call{value: amount}("");
require(sent, "Failed to send Ether");
\`\`\`

3. If ignoring the result is intentional (e.g. best-effort payout), document it and
   emit an event on failure so the failure is observable:

\`\`\`solidity
if (!payable(recipient).send(amount)) {
    emit PayoutFailed(recipient, amount);
}
\`\`\``;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }

  private buildRecommendation(method: string): string {
    const valueSuffix = method === 'send' ? '' : '{value: amount}';

    return [
      `Capture the return value and check it: \`(bool success, ) = target.${method}${valueSuffix}(...); require(success, "Call failed");\`.`,
      'Never leave the result of a low-level call unchecked — a silent failure can leave the contract in an inconsistent state.',
    ].join(' ');
  }
}
