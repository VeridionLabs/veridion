import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const CALL_KINDS = ['call', 'send', 'delegatecall'] as const;
type CallKind = (typeof CALL_KINDS)[number];

const CALL_MEMBER_RE = /\.(call|send|delegatecall)\b/g;
const NEXT_REGION_RE = /\b(?:function|modifier|constructor|receive|fallback)\b/;
const BOOL_LITERAL = '(?:true|false|0|1)';

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description:
    'Detects low-level .call(), .send(), and .delegatecall() invocations whose success flag is ignored (SWC-104).',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'swc-104', 'low-level-call', 'send', 'delegatecall'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://cwe.mitre.org/data/definitions/252.html',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/',
  ],
};

function isCallKind(value: string | undefined): value is CallKind {
  return value === 'call' || value === 'send' || value === 'delegatecall';
}

/**
 * Blank comments and string literals while keeping newlines and offsets so
 * detections cannot come from, or be suppressed by, non-code text.
 */
function sanitizeSource(source: string): string {
  const out: string[] = new Array<string>(source.length);
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : '';

    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') {
        out[i] = ' ';
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i + 1 < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out[i] = source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i + 1 < n) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
      } else if (i < n) {
        out[i] = ' ';
        i += 1;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      out[i] = ' ';
      i += 1;
      while (i < n) {
        const c = source[i];
        if (c === '\\') {
          out[i] = ' ';
          if (i + 1 < n) {
            out[i + 1] = ' ';
            i += 2;
          } else {
            i += 1;
          }
          continue;
        }
        if (c === quote) {
          out[i] = ' ';
          i += 1;
          break;
        }
        out[i] = c === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }

    out[i] = ch ?? ' ';
    i += 1;
  }

  return out.join('');
}

function findMatching(text: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipWs(text: string, index: number): number {
  let i = index;
  while (i < text.length) {
    const c = text[i];
    if (c === undefined || !/\s/.test(c)) break;
    i += 1;
  }
  return i;
}

/** After `.call` / `.send` / `.delegatecall`, skip `{...}` options and return the `(` of the arg list. */
function findArgListOpen(text: string, afterNameIdx: number): number {
  let i = skipWs(text, afterNameIdx);
  const maybeBrace = text[i];
  if (maybeBrace === '{') {
    const close = findMatching(text, i, '{', '}');
    if (close === -1) return -1;
    i = skipWs(text, close + 1);
  }
  return text[i] === '(' ? i : -1;
}

function statementStart(text: string, index: number): number {
  const lastSemi = text.lastIndexOf(';', index);
  const lastOpen = text.lastIndexOf('{', index);
  const lastClose = text.lastIndexOf('}', index);
  return Math.max(0, lastSemi + 1, lastOpen + 1, lastClose + 1);
}

/**
 * True when the call is *inside* require/assert/if/while parentheses, or is a
 * returned expression. `if (ready) addr.call()` is NOT a check — the call is
 * the then-body, not the condition.
 */
function isCallUsedAsCheckExpression(prefix: string): boolean {
  if (/(?:^|[\s;{}])return\b[\s\S]*$/.test(prefix) && !prefix.trimEnd().endsWith(';')) {
    return true;
  }

  const headerRe = /\b(require|assert|if|while)\s*\(/g;
  let lastOpen = -1;
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(prefix)) !== null) {
    lastOpen = match.index + match[0].length - 1;
  }
  if (lastOpen === -1) return false;

  let depth = 0;
  for (let i = lastOpen; i < prefix.length; i++) {
    const c = prefix[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
  }
  return depth > 0;
}

interface Assignment {
  assigned: boolean;
  discarded: boolean;
  name: string | null;
}

function isAssignmentEquals(text: string, eqIdx: number): boolean {
  const prev = eqIdx > 0 ? text[eqIdx - 1] : '';
  const next = eqIdx + 1 < text.length ? text[eqIdx + 1] : '';
  if (next === '=' || next === '>') return false;
  if (prev === '=' || prev === '!' || prev === '<' || prev === '>') return false;
  return true;
}

function lastAssignmentIndex(prefix: string): number {
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (prefix[i] === '=' && isAssignmentEquals(prefix, i)) return i;
  }
  return -1;
}

function parseTupleFirstSlot(inner: string): Assignment {
  const first = (inner.split(',')[0] ?? '').trim();
  if (first === '' || first === '_' || first === 'bool') {
    return { assigned: true, discarded: true, name: null };
  }
  const named = first.match(/^(?:bool\s+)?([A-Za-z_][A-Za-z0-9_]*)$/);
  const name = named?.[1];
  if (!name || name === 'bool' || name === '_') {
    return { assigned: true, discarded: true, name: null };
  }
  return { assigned: true, discarded: false, name };
}

function parseAssignment(prefix: string): Assignment {
  const eqIdx = lastAssignmentIndex(prefix);
  if (eqIdx === -1) return { assigned: false, discarded: false, name: null };

  const lhs = prefix.slice(0, eqIdx).trim();
  if (lhs.startsWith('(')) {
    const close = findMatching(lhs, 0, '(', ')');
    const inner = close === -1 ? lhs.slice(1) : lhs.slice(1, close);
    return parseTupleFirstSlot(inner);
  }

  const named = lhs.match(/(?:^|[^\w])(?:bool\s+)?([A-Za-z_][A-Za-z0-9_]*)$/);
  const name = named?.[1];
  if (!name || name === '_') {
    return { assigned: true, discarded: true, name: null };
  }
  return { assigned: true, discarded: false, name };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A captured success flag is only considered checked when it is used as a
 * boolean in require/assert/if/while/return against *literals* (`true`/`false`/
 * `0`/`1`). Identifiers such as `trueFlag` or `untrue` are not literals, so
 * `require(ok == trueFlag)` remains a finding.
 */
function isSuccessFlagChecked(window: string, varName: string): boolean {
  const v = escapeRegExp(varName);
  const patterns = [
    new RegExp(`\\b(?:require|assert)\\s*\\(\\s*(?:!\\s*)?${v}\\s*(?:,|\\))`),
    new RegExp(
      `\\b(?:require|assert)\\s*\\(\\s*${v}\\s*(?:==|===|!=|!==)\\s*${BOOL_LITERAL}\\s*(?:,|\\))`,
    ),
    new RegExp(
      `\\b(?:require|assert)\\s*\\(\\s*${BOOL_LITERAL}\\s*(?:==|===|!=|!==)\\s*${v}\\s*(?:,|\\))`,
    ),
    new RegExp(`\\bif\\s*\\(\\s*(?:!\\s*)?${v}\\s*\\)`),
    new RegExp(`\\bif\\s*\\(\\s*${v}\\s*(?:==|===|!=|!==)\\s*${BOOL_LITERAL}\\s*\\)`),
    new RegExp(`\\bif\\s*\\(\\s*${BOOL_LITERAL}\\s*(?:==|===|!=|!==)\\s*${v}\\s*\\)`),
    new RegExp(`\\bwhile\\s*\\(\\s*(?:!\\s*)?${v}\\s*\\)`),
    new RegExp(`\\breturn\\s+(?:!\\s*)?${v}\\s*;`),
  ];
  return patterns.some((pattern) => pattern.test(window));
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function snippetAt(source: string, index: number): string {
  const lines = source.split('\n');
  const line = lineNumberAt(source, index);
  return (lines[line - 1] ?? '').trim().slice(0, 200);
}

function remainingFunctionWindow(text: string, from: number): string {
  const rest = text.slice(from);
  const cut = rest.search(NEXT_REGION_RE);
  return cut === -1 ? rest : rest.slice(0, cut);
}

function afterCallStatement(text: string, closeParen: number): number {
  const i = skipWs(text, closeParen + 1);
  return text[i] === ';' ? i + 1 : closeParen + 1;
}

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (!context.sourceCode || !this.supportsContext(context)) {
      return [];
    }

    const findings: FindingResult[] = [];
    const original = context.sourceCode;
    const source = sanitizeSource(original);

    CALL_MEMBER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CALL_MEMBER_RE.exec(source)) !== null) {
      const kind = match[1];
      if (!isCallKind(kind)) continue;

      const argOpen = findArgListOpen(source, match.index + match[0].length);
      if (argOpen === -1) continue;

      const argClose = findMatching(source, argOpen, '(', ')');
      if (argClose === -1) continue;

      const prefix = source.slice(statementStart(source, match.index), match.index);
      if (isCallUsedAsCheckExpression(prefix)) continue;

      const assignment = parseAssignment(prefix);
      if (assignment.name) {
        const window = remainingFunctionWindow(source, afterCallStatement(source, argClose));
        if (isSuccessFlagChecked(window, assignment.name)) continue;
      }

      const lineStart = lineNumberAt(original, match.index);
      findings.push({
        pluginId: this.metadata.id,
        title: `Unchecked Return Value from .${kind}()`,
        description:
          `The success flag of a low-level .${kind}() call is not checked. ` +
          'Failed calls return false instead of reverting, so execution can continue ' +
          'as if the call succeeded (SWC-104).',
        severity: this.metadata.severity,
        filePath: `${context.contractName}.sol`,
        lineStart,
        lineEnd: lineStart,
        codeSnippet: snippetAt(original, match.index),
        recommendation: `Capture and validate the boolean: (bool success, ) = target.${kind}(...); require(success);`,
        confidence: assignment.discarded ? 0.92 : 0.9,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return (
      `Fix unchecked return at ${finding.filePath}:${finding.lineStart}:\n\n` +
      'Always check the boolean returned by low-level calls with require(success):\n\n' +
      'For .call():\n' +
      '(bool success, ) = recipient.call{value: amount}("");\n' +
      'require(success, "Call failed");\n\n' +
      'For .send():\n' +
      'require(recipient.send(amount), "Send failed");\n\n' +
      'For .delegatecall():\n' +
      '(bool success, ) = target.delegatecall(data);\n' +
      'require(success, "Delegatecall failed");'
    );
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}
