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
    'Detects low-level .call(), .send(), and .delegatecall() invocations where the boolean success return value is not checked.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: [
    'unchecked-return',
    'swc-104',
    'low-level-call',
    'call',
    'send',
    'delegatecall',
    'security',
  ],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/',
  ],
};

const LOW_LEVEL_CALL_REGEX = /\.(call|send|delegatecall)\b(?:\s*\{[\s\S]*?\})?\s*\(/g;

function maskCommentsAndStrings(source: string): string {
  const chars = source.split('');
  let i = 0;
  const len = chars.length;

  while (i < len) {
    if (chars[i] === '/' && i + 1 < len && chars[i + 1] === '/') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < len && chars[i] !== '\n') {
        chars[i] = ' ';
        i++;
      }
    } else if (chars[i] === '/' && i + 1 < len && chars[i + 1] === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < len && !(chars[i] === '*' && i + 1 < len && chars[i + 1] === '/')) {
        if (chars[i] !== '\n') chars[i] = ' ';
        i++;
      }
      if (i < len) {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 2;
      }
    } else if (chars[i] === '"') {
      chars[i] = ' ';
      i++;
      while (i < len && chars[i] !== '"') {
        if (chars[i] === '\\' && i + 1 < len) {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
        } else {
          if (chars[i] !== '\n') chars[i] = ' ';
          i++;
        }
      }
      if (i < len) {
        chars[i] = ' ';
        i++;
      }
    } else if (chars[i] === "'") {
      chars[i] = ' ';
      i++;
      while (i < len && chars[i] !== "'") {
        if (chars[i] === '\\' && i + 1 < len) {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
        } else {
          if (chars[i] !== '\n') chars[i] = ' ';
          i++;
        }
      }
      if (i < len) {
        chars[i] = ' ';
        i++;
      }
    } else {
      i++;
    }
  }

  return chars.join('');
}

function findStatementBounds(source: string, matchIndex: number): number {
  let stmtStart = 0;
  for (let i = matchIndex - 1; i >= 0; i--) {
    if (source[i] === ';' || source[i] === '{' || source[i] === '}') {
      stmtStart = i + 1;
      break;
    }
  }
  return stmtStart;
}

function isDirectlyChecked(prefix: string): boolean {
  const checkKeywords = ['require', 'assert', 'if', 'while'];
  for (const kw of checkKeywords) {
    const kwRegex = new RegExp(`\\b${kw}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = kwRegex.exec(prefix)) !== null) {
      let depth = 0;
      let argIndex = 0;
      for (let j = match.index + match[0].length - 1; j < prefix.length; j++) {
        if (prefix[j] === '(' || prefix[j] === '{' || prefix[j] === '[') depth++;
        else if (prefix[j] === ')' || prefix[j] === '}' || prefix[j] === ']') depth--;
        else if (prefix[j] === ',' && depth === 1) argIndex++;
      }
      if (depth > 0 && argIndex === 0) {
        return true;
      }
    }
  }

  const returnMatch = /\breturn\b/.exec(prefix);
  if (returnMatch) {
    return true;
  }

  return false;
}

function getAssignment(prefix: string): { isAssigned: boolean; name: string | null } {
  const idx = prefix.lastIndexOf('=');
  if (idx === -1) return { isAssigned: false, name: null };

  const prev = prefix[idx - 1] ?? '';
  const next = prefix[idx + 1] ?? '';
  if (prev === '=' || prev === '!' || prev === '<' || prev === '>' || next === '=') {
    return { isAssigned: false, name: null };
  }

  const afterEq = prefix.slice(idx + 1);
  if (/[,;{}]/.test(afterEq)) {
    return { isAssigned: false, name: null };
  }

  const lhs = prefix.slice(0, idx).trim();

  if (lhs.startsWith('(')) {
    const m = lhs.match(/^\(\s*(?:bool\s+)?([a-zA-Z_$][\w$]*)\s*[,)]/);
    if (m) return { isAssigned: true, name: m[1] ?? null };
    if (lhs.match(/^\(\s*,/)) return { isAssigned: true, name: null };
    return { isAssigned: true, name: null };
  }

  const m = lhs.match(/(?:\bbool\s+)?([a-zA-Z_$][\w$]*)$/);
  if (m) return { isAssigned: true, name: m[1] ?? null };

  return { isAssigned: true, name: null };
}

function isVarCheckedLater(source: string, matchIndex: number, varName: string): boolean {
  let depth = 0;
  for (let i = 0; i <= matchIndex; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
  }

  const targetDepth = depth > 1 ? 1 : 0;
  let searchEnd = source.length;

  for (let i = matchIndex + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === targetDepth) {
        searchEnd = i;
        break;
      }
    }
  }

  const scopeStr = source.slice(matchIndex, searchEnd);

  const checkRegex = new RegExp(`\\b(require|assert|if)\\s*\\([^;{]*\\b${varName}\\b`);
  const checkMatch = scopeStr.match(checkRegex);
  let checkIdx = -1;
  if (checkMatch && checkMatch.index !== undefined) {
    checkIdx = checkMatch.index;
  }

  const returnRegex = new RegExp(`\\breturn\\b[^;]*\\b${varName}\\b`);
  const returnMatch = scopeStr.match(returnRegex);
  if (returnMatch && returnMatch.index !== undefined) {
    if (checkIdx === -1 || returnMatch.index < checkIdx) {
      checkIdx = returnMatch.index;
    }
  }

  if (checkIdx !== -1) {
    const prefix = scopeStr.slice(0, checkIdx);
    const reassignRegex = new RegExp(
      `(?:\\b${varName}\\b\\s*=|\\(\\s*(?:bool\\s+)?\\b${varName}\\b\\s*[,)][^=]*=)`,
    );
    if (reassignRegex.test(prefix)) {
      return false;
    }
    return true;
  }

  return false;
}

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (!context.sourceCode || typeof context.sourceCode !== 'string') {
      return [];
    }

    if (!this.supportsContext(context)) {
      return [];
    }

    const findings: FindingResult[] = [];
    const sourceCode = context.sourceCode;
    const masked = maskCommentsAndStrings(sourceCode);
    const originalLines = sourceCode.split('\n');

    LOW_LEVEL_CALL_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = LOW_LEVEL_CALL_REGEX.exec(masked)) !== null) {
      const callKind = match[1] ?? 'call';
      const matchIndex = match.index;

      const stmtStart = findStatementBounds(masked, matchIndex);
      const prefix = masked.slice(stmtStart, matchIndex);

      if (isDirectlyChecked(prefix)) {
        continue;
      }

      const { isAssigned, name: varName } = getAssignment(prefix);

      if (isAssigned) {
        if (varName && isVarCheckedLater(masked, matchIndex, varName)) {
          continue;
        }
      }

      const lineStart = sourceCode.slice(0, matchIndex).split('\n').length;
      const callEndIndex = matchIndex + match[0].length;
      const lineEnd = sourceCode.slice(0, callEndIndex).split('\n').length;
      const codeSnippet = (originalLines[lineStart - 1] ?? match[0]).trim();

      findings.push({
        pluginId: this.metadata.id,
        title: `Unchecked Return Value from .${callKind}()`,
        description: `The return value of low-level .${callKind}() call is not checked. Low-level calls return a boolean indicating success or failure. If not checked, failed calls will continue execution silently, potentially leading to inconsistent contract state or loss of funds (SWC-104).`,
        severity: this.metadata.severity,
        filePath: `${context.contractName}.sol`,
        lineStart,
        lineEnd,
        codeSnippet,
        recommendation: `Check the return value using require(success): (bool success, ) = target.${callKind}(""); require(success, "${callKind} failed");`,
        confidence: 0.9,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the unchecked return value at ${finding.filePath}:${finding.lineStart}:

Capture the boolean return value and verify it with require():

For .call():
\`\`\`solidity
(bool success, ) = recipient.call{value: amount}("");
require(success, "Call failed");
\`\`\`

For .send():
\`\`\`solidity
bool success = recipient.send(amount);
require(success, "Send failed");
// Or directly:
// require(recipient.send(amount), "Send failed");
\`\`\`

For .delegatecall():
\`\`\`solidity
(bool success, bytes memory data) = target.delegatecall(callData);
require(success, "Delegatecall failed");
\`\`\``;
  }

  supportsContext(context: AnalysisContext): boolean {
    const languageSupported = this.metadata.languages.includes(context.language);
    const chainSupported = !context.chain || this.metadata.chains.includes(context.chain);
    return languageSupported && chainSupported;
  }
}
