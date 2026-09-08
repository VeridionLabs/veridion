import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

interface Token {
  value: string;
  start: number;
  end: number;
}

const methods = new Set(['call', 'send', 'delegatecall', 'staticcall']);
const references = ['https://swcregistry.io/docs/SWC-104/'];

function tokenize(source: string): Token[] {
  const pattern =
    /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[a-zA-Z_$][\w$]*|\d+|==|!=|&&|\|\||=>|[^\s]/g;
  return Array.from(source.matchAll(pattern))
    .filter(([value]) => !value.startsWith('//') && !value.startsWith('/*'))
    .map((match) => ({ value: match[0], start: match.index, end: match.index + match[0].length }));
}

function pairs(tokens: Token[]): Map<number, number> {
  const result = new Map<number, number>();
  const stack: number[] = [];
  const closing: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  tokens.forEach(({ value }, index) => {
    if (['(', '[', '{'].includes(value)) stack.push(index);
    else if (closing[value]) {
      const start = stack.pop();
      if (start !== undefined && tokens[start]?.value === closing[value]) {
        result.set(start, index);
        result.set(index, start);
      }
    }
  });
  return result;
}

function text(tokens: Token[]): string {
  return tokens.map((token) => token.value).join(' ');
}

function unwrap(tokens: Token[]): Token[] {
  while (tokens[0]?.value === '(' && pairs(tokens).get(0) === tokens.length - 1) {
    tokens = tokens.slice(1, -1);
  }
  return tokens;
}

function checks(tokens: Token[], name: string, success: boolean): boolean {
  tokens = unwrap(tokens);
  const value = text(tokens);
  const literal = success ? 'true' : 'false';
  const opposite = success ? 'false' : 'true';
  if (value === name) return success;
  if (tokens[0]?.value === '!') return checks(tokens.slice(1), name, !success);
  return (
    value === `${name} == ${literal}` ||
    value === `${literal} == ${name}` ||
    value === `${name} != ${opposite}` ||
    value === `${opposite} != ${name}`
  );
}

function guarded(tokens: Token[], name: string): boolean {
  const keyword = tokens[0]?.value;
  if (keyword === 'return') return text(tokens.slice(1, 3)) === `${name} ;`;
  if (!['require', 'assert', 'if'].includes(keyword ?? '') || tokens[1]?.value !== '(') {
    return false;
  }
  const end = pairs(tokens).get(1);
  if (end === undefined) return false;
  let condition = tokens.slice(2, end);
  const comma = condition.findIndex((token) => token.value === ',');
  if (comma !== -1 && keyword !== 'if') condition = condition.slice(0, comma);
  if (keyword !== 'if') return checks(condition, name, true);
  if (!checks(condition, name, false)) return false;
  const body = tokens.slice(end + 1);
  return body[0]?.value === 'revert' || (body[0]?.value === '{' && body[1]?.value === 'revert');
}

function statementStart(tokens: Token[], index: number, matched: Map<number, number>): number {
  for (let i = index - 1; i >= 0; i--) {
    const value = tokens[i]?.value;
    if (value === ')' || value === ']') {
      i = matched.get(i) ?? i;
    } else if (value === ';' || value === '{' || value === '}') {
      return i + 1;
    }
  }
  return 0;
}

function receiverStart(tokens: Token[], index: number, matched: Map<number, number>): number {
  let start = index;
  while (start > 0) {
    if (tokens[start]?.value === ')' || tokens[start]?.value === ']') {
      const open = matched.get(start);
      if (open === undefined) break;
      start = open;
      if (/^[a-zA-Z_$]/.test(tokens[start - 1]?.value ?? '')) start--;
    } else if (tokens[start - 1]?.value === '.') {
      start -= 2;
    } else break;
  }
  return start;
}

function capturedName(tokens: Token[], method: string): string | undefined {
  const lhs = text(tokens);
  const match =
    method === 'send'
      ? /^(?:bool )?([a-zA-Z_$][\w$]*) =$/.exec(lhs)
      : /^\( (?:bool )?([a-zA-Z_$][\w$]*) ,[^]* \) =$/.exec(lhs);
  return match?.[1];
}

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description: 'Detects low-level Solidity calls without a recognized success check.',
  severity: FindingSeverity.MEDIUM,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'low-level-call', 'swc-104'],
  references,
};

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (!this.supportsContext(context)) return Promise.resolve([]);
    const tokens = tokenize(context.sourceCode);
    const matched = pairs(tokens);
    const findings: FindingResult[] = [];

    tokens.forEach((token, index) => {
      if (!methods.has(token.value) || tokens[index - 1]?.value !== '.') return;
      let open = index + 1;
      if (tokens[open]?.value === '{') open = (matched.get(open) ?? tokens.length) + 1;
      // Solidity before 0.7 used call.value(...).gas(...)(...).
      while (
        tokens[open]?.value === '.' &&
        ['value', 'gas'].includes(tokens[open + 1]?.value ?? '')
      ) {
        open = (matched.get(open + 2) ?? tokens.length) + 1;
      }
      if (tokens[open]?.value !== '(') return;
      const end = matched.get(open);
      if (end === undefined) return;
      const start = statementStart(tokens, index, matched);
      const receiver = receiverStart(tokens, index - 2, matched);
      const prefix = tokens.slice(start, receiver);
      const name = capturedName(prefix, token.value);
      const after = tokens.slice(end + 1);
      if (name && after[0]?.value === ';' && guarded(after.slice(1), name)) return;
      if (prefix[0]?.value === 'return' && after[0]?.value === ';') return;

      // Only send() returns a single bool that can be checked inline.
      if (token.value === 'send') {
        const callStart = prefix.findIndex(({ value }) => value === '(');
        const placeholder: Token = { value: 'result', start: token.start, end: token.end };
        if (callStart !== -1 && guarded([...prefix, placeholder, ...after], 'result')) return;
      }

      const first = tokens[start] ?? token;
      const last = tokens[end] ?? token;
      findings.push({
        pluginId: metadata.id,
        title: `Unchecked ${token.value}() return value`,
        description: `No recognized success check follows this ${token.value}() call. A failed low-level call returns false instead of reverting the caller.`,
        severity: metadata.severity,
        filePath: `${context.contractName}.sol`,
        lineStart: context.sourceCode.slice(0, first.start).split('\n').length,
        lineEnd: context.sourceCode.slice(0, last.end).split('\n').length,
        codeSnippet: context.sourceCode.slice(first.start, last.end),
        recommendation:
          token.value === 'send'
            ? 'Capture the boolean result: bool success = recipient.send(amount); require(success, "Send failed");'
            : `Capture the success flag: (bool success, ) = target.${token.value}(data); require(success, "Call failed"); Preserve any original value and gas options.`,
        confidence: 0.7,
        references: [...references],
      });
    });
    return Promise.resolve(findings);
  }

  getFixRecommendation(finding: FindingResult): string {
    return finding.recommendation;
  }

  supportsContext(context: AnalysisContext): boolean {
    return metadata.languages.includes(context.language) && metadata.chains.includes(context.chain);
  }
}
