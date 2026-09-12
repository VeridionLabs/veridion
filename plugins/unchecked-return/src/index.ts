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
    'Detects low-level calls (.call/.send/.delegatecall/.staticcall) and ERC-20 transfers whose boolean return value is never checked, allowing failed transfers to fail silently (SWC-104).',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: [
    'unchecked-return',
    'swc-104',
    'call',
    'send',
    'delegatecall',
    'staticcall',
    'erc20',
    'silent-failure',
  ],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/',
    'https://cwe.mitre.org/data/definitions/252.html',
  ],
};

type CallKind = 'LOW_LEVEL' | 'ERC20';

interface CallSite {
  kind: CallKind;
  receiver: string;
  method: string;
  /** Index of the receiver expression inside the comment-stripped source. */
  start: number;
  /** Index just past the opening parenthesis of the argument list. */
  argsStart: number;
}

/**
 * Low-level members that report failure through a boolean return value instead
 * of reverting. `transfer` is intentionally absent: for native ETH it reverts on
 * failure and is therefore safe, while the ERC-20 overload is handled by
 * ERC20_PATTERN (disambiguated by argument count).
 */
const LOW_LEVEL_PATTERN =
  /\b([A-Za-z_$][\w$]*(?:\s*(?:\.[A-Za-z_$][\w$]*|\([^()]*\)))*)\s*\.\s*(call|callcode|delegatecall|staticcall|send)\s*(\{[^{}]*\})?\s*\(/g;

const ERC20_PATTERN =
  /\b([A-Za-z_$][\w$]*(?:\s*(?:\.[A-Za-z_$][\w$]*|\([^()]*\)))*)\s*\.\s*(transferFrom|approve|transfer)\s*\(/g;

const MAX_SNIPPET_LENGTH = 200;

/**
 * Blank out comments while preserving every character offset, so line numbers
 * keep matching the original source. Code inside comments must never produce a
 * finding.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let stringDelimiter: '"' | "'" | null = null;

  while (i < source.length) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += ch;
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        out += '  ';
        i += 2;
        inBlockComment = false;
      } else {
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }

    if (stringDelimiter !== null) {
      if (ch === '\\') {
        // Blank out the escape and the escaped character while preserving
        // newlines so line numbers still match the original source.
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === stringDelimiter) {
        stringDelimiter = null;
        out += ch;
        i += 1;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      out += '  ';
      i += 2;
      inLineComment = true;
      continue;
    }

    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      inBlockComment = true;
      continue;
    }

    if (ch === '"' || ch === "'") {
      stringDelimiter = ch;
      out += ch;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function lineNumberOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charAt(i) === '\n') line += 1;
  }
  return line;
}

/** Walk backwards to the closest statement boundary (`;`, `{` or `}`). */
function findStatementStart(source: string, index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    const ch = source.charAt(i);
    if (ch === ';' || ch === '{' || ch === '}') return i + 1;
  }
  return 0;
}

/**
 * Walk forwards to the end of the logical statement. Braces and parentheses are
 * balanced so that `call{value: x}(...)` is not mistaken for a statement end.
 */
function findStatementEnd(source: string, index: number): number {
  let depth = 0;
  for (let i = index; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === '(' || ch === '{') {
      depth += 1;
    } else if (ch === ')' || ch === '}') {
      if (depth === 0) return i;
      depth -= 1;
    } else if (ch === ';' && depth === 0) {
      return i + 1;
    }
  }
  return source.length;
}

/** Count top-level arguments of the call whose opening paren is at `openParen`. */
function countArguments(source: string, openParen: number): number {
  let depth = 0;
  let separators = 0;
  let hasContent = false;

  for (let i = openParen; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return hasContent ? separators + 1 : 0;
    } else if (depth === 1) {
      if (ch === ',') separators += 1;
      else if (!/\s/.test(ch)) hasContent = true;
    }
  }

  return hasContent ? separators + 1 : 0;
}

/**
 * True when the boolean produced by the call is consumed by a guard.
 * Covers `require(x)`, `assert(x)`, `if (x)`, `if (!x)`, `while (x)` and
 * `return x`, where `x` is the call itself.
 */
function isWrappedInGuard(statement: string): boolean {
  const trimmed = statement.trimStart();
  return (
    /^(require|assert|if|while|for)\s*\(/.test(trimmed) ||
    /^return\b/.test(trimmed) ||
    /^(!|\|\||&&)/.test(trimmed) ||
    /^(bool|var)\s/.test(trimmed)
  );
}

/** Variable names introduced by the statement, e.g. `bool ok` or `(bool ok, )`. */
function collectTargetNames(textBeforeCall: string): string[] {
  const names = new Set<string>();

  const declared = /\bbool\s+([A-Za-z_$][\w$]*)/.exec(textBeforeCall);
  if (declared?.[1]) names.add(declared[1]);

  const assigned = /([A-Za-z_$][\w$]*)\s*=(?!=)/.exec(textBeforeCall);
  if (assigned?.[1]) names.add(assigned[1]);

  return Array.from(names);
}

/** True when `name` is later used inside a guard such as `require(success)`. */
function isNameCheckedLater(source: string, name: string, fromIndex: number): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `\\b(?:require|assert|if|while|return)\\s*\\(?\\s*!?\\s*${escaped}\\b`,
    'm',
  );
  return pattern.test(source.slice(fromIndex));
}

function isChecked(
  source: string,
  statementStart: number,
  statementEnd: number,
  callStart: number,
): boolean {
  const statement = source.slice(statementStart, statementEnd);
  if (isWrappedInGuard(statement)) return true;

  const textBeforeCall = source.slice(statementStart, callStart);
  const targets = collectTargetNames(textBeforeCall);
  if (targets.some((name) => isNameCheckedLater(source, name, statementEnd))) return true;

  const textAfterCall = source.slice(callStart, statementEnd);
  return /\brevert\b/.test(textAfterCall) || /\|\|/.test(textAfterCall);
}

function collectCallSites(source: string): CallSite[] {
  const sites: CallSite[] = [];

  LOW_LEVEL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOW_LEVEL_PATTERN.exec(source)) !== null) {
    const receiver = match[1];
    const method = match[2];
    if (receiver === undefined || method === undefined) continue;
    sites.push({
      kind: 'LOW_LEVEL',
      receiver,
      method,
      start: match.index,
      argsStart: match.index + match[0].length,
    });
  }

  ERC20_PATTERN.lastIndex = 0;
  let erc20Match: RegExpExecArray | null;
  while ((erc20Match = ERC20_PATTERN.exec(source)) !== null) {
    const receiver = erc20Match[1];
    const method = erc20Match[2];
    if (receiver === undefined || method === undefined) continue;

    // `address.transfer(uint256)` is the native ETH variant: it reverts on
    // failure, so it carries no unchecked-return risk. ERC-20 `transfer`
    // always takes two arguments (recipient, amount).
    if (
      method === 'transfer' &&
      countArguments(source, erc20Match.index + erc20Match[0].length - 1) < 2
    ) {
      continue;
    }

    sites.push({
      kind: 'ERC20',
      receiver,
      method,
      start: erc20Match.index,
      argsStart: erc20Match.index + erc20Match[0].length,
    });
  }

  return sites.sort((a, b) => a.start - b.start);
}

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // No external resources are required; detection is purely source-based.
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const source = stripComments(context.sourceCode);
    if (source.trim().length === 0) return findings;

    for (const site of collectCallSites(source)) {
      const statementStart = findStatementStart(source, site.start);
      const statementEnd = findStatementEnd(source, site.start);
      if (isChecked(source, statementStart, statementEnd, site.start)) continue;

      const isLowLevel = site.kind === 'LOW_LEVEL';
      const lineStart = lineNumberOf(source, site.start);
      const lineEnd = Math.max(lineStart, lineNumberOf(source, statementEnd - 1));
      const snippet = source.slice(statementStart, statementEnd).trim();

      findings.push({
        pluginId: this.metadata.id,
        title: isLowLevel
          ? `Unchecked return value of \`${site.method}()\` on \`${site.receiver}\``
          : `Unchecked ERC-20 return value of \`${site.method}()\` on \`${site.receiver}\``,
        description: isLowLevel
          ? `\`${site.receiver}.${site.method}()\` does not revert when the callee fails; it returns \`false\` instead. ` +
            'Because this return value is discarded, a failed transfer or call is silently ignored and the ' +
            'contract continues executing as if it succeeded, which can corrupt accounting or lock funds.'
          : `\`${site.receiver}.${site.method}()\` returns a boolean that is not part of the ERC-20 guarantee: ` +
            'many tokens return `false` on failure instead of reverting. Discarding the result means a failed ' +
            'token movement is silently ignored. Non-standard tokens (e.g. USDT) may not return a value at all, ' +
            'so prefer OpenZeppelin SafeERC20.',
        severity: isLowLevel ? FindingSeverity.HIGH : FindingSeverity.MEDIUM,
        filePath: `${context.contractName}.sol`,
        lineStart,
        lineEnd,
        codeSnippet: snippet.slice(0, MAX_SNIPPET_LENGTH),
        recommendation: isLowLevel
          ? 'Capture the boolean result and enforce it: ' +
            '`(bool success, ) = target.call{value: amount}(""); require(success, "call failed");`. ' +
            'Alternatively use OpenZeppelin `Address.sendValue(target, amount)`, which reverts on failure.'
          : 'Use OpenZeppelin SafeERC20 (`safeTransfer`, `safeTransferFrom`, `safeApprove`) which reverts on ' +
            'failure, or check the return value explicitly: `require(token.transfer(to, amount), "transfer failed");`.',
        confidence: isLowLevel ? 0.9 : 0.65,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the unchecked return value at ${finding.filePath}:${finding.lineStart}:

1. Capture the boolean returned by the external call:
   \`\`\`solidity
   (bool success, ) = target.call{value: amount}("");
   \`\`\`

2. Enforce it with \`require(success)\` before continuing:
   \`\`\`solidity
   require(success, "transfer failed");
   \`\`\`

3. For ERC-20 tokens prefer OpenZeppelin SafeERC20, which reverts on failure and
   also supports tokens that return no value:
   \`\`\`solidity
   import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

   using SafeERC20 for IERC20;
   token.safeTransfer(to, amount);
   \`\`\`

${finding.recommendation}`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}
