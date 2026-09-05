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
    // Single-line comment: // ...
    if (chars[i] === '/' && chars[i + 1] === '/') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < len && chars[i] !== '\n') {
        chars[i] = ' ';
        i++;
      }
    }
    // Block comment: /* ... */
    else if (chars[i] === '/' && chars[i + 1] === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < len && !(chars[i] === '*' && chars[i + 1] === '/')) {
        if (chars[i] !== '\n') {
          chars[i] = ' ';
        }
        i++;
      }
      if (i < len) {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 2;
      }
    }
    // Double-quoted string literal: "..."
    else if (chars[i] === '"') {
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
    }
    // Single-quoted string literal: '...'
    else if (chars[i] === "'") {
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

function isDirectlyChecked(prefix: string): boolean {
  const checkKeywords = ['require', 'assert', 'if'];

  for (const kw of checkKeywords) {
    const kwRegex = new RegExp(`\\b${kw}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = kwRegex.exec(prefix)) !== null) {
      let depth = 0;
      for (let j = match.index + match[0].length - 1; j < prefix.length; j++) {
        if (prefix[j] === '(') depth++;
        else if (prefix[j] === ')') depth--;
      }
      if (depth > 0) {
        return true;
      }
    }
  }

  // Check if call return is directly passed to return statement
  const returnMatch = /\breturn\s+/.exec(prefix);
  if (returnMatch) {
    let depth = 0;
    for (let j = returnMatch.index + returnMatch[0].length; j < prefix.length; j++) {
      if (prefix[j] === '(' || prefix[j] === '{' || prefix[j] === '[') depth++;
      else if (prefix[j] === ')' || prefix[j] === '}' || prefix[j] === ']') depth--;
    }
    if (depth === 0) {
      return true;
    }
  }

  return false;
}

function findAssignmentIndex(prefix: string): number {
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === '=') {
      const prev = i > 0 ? prefix[i - 1] : '';
      const next = i + 1 < prefix.length ? prefix[i + 1] : '';
      if (
        prev !== '=' &&
        prev !== '!' &&
        prev !== '<' &&
        prev !== '>' &&
        next !== '=' &&
        next !== '>'
      ) {
        return i;
      }
    }
  }
  return -1;
}

function extractAssignedVariable(lhs: string): {
  isAssigned: boolean;
  variableName: string | null;
} {
  // Tuple assignment, e.g. `(bool success, ) =` or `(success, ) =` or `(, bytes memory data) =`
  const tupleMatch = lhs.match(/\(\s*([^,]*)\s*,/);
  if (tupleMatch) {
    const firstElem = (tupleMatch[1] ?? '').trim();
    const varName = firstElem.replace(/^bool\s+/, '').trim();
    if (!varName || varName === '_') {
      return { isAssigned: true, variableName: null };
    }
    return { isAssigned: true, variableName: varName };
  }

  // Single variable assignment, e.g. `bool sent =` or `sent =`
  const singleMatch = lhs.match(/(?:\bbool\s+)?([A-Za-z_$][\w$]*)$/);
  if (singleMatch) {
    const varName = (singleMatch[1] ?? '').trim();
    if (!varName || varName === '_') {
      return { isAssigned: true, variableName: null };
    }
    return { isAssigned: true, variableName: varName };
  }

  return { isAssigned: false, variableName: null };
}

function isVariableValidated(masked: string, startIndex: number, varName: string): boolean {
  const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Start checking after the statement containing the call ends
  const semicolonIndex = masked.indexOf(';', startIndex);
  const searchStart = semicolonIndex !== -1 ? semicolonIndex + 1 : startIndex;

  // Search ahead within the function / block scope
  let depth = 0;
  let searchEnd = masked.length;
  for (let i = searchStart; i < masked.length; i++) {
    if (masked[i] === '{') {
      depth++;
    } else if (masked[i] === '}') {
      depth--;
      if (depth < 0) {
        searchEnd = i;
        break;
      }
    }
  }

  const searchWindow = masked.slice(searchStart, Math.min(searchStart + 3000, searchEnd));

  const validationPatterns = [
    new RegExp(`\\brequire\\s*\\([^;]*\\b${escapedVar}\\b`),
    new RegExp(`\\bassert\\s*\\([^;]*\\b${escapedVar}\\b`),
    new RegExp(`\\bif\\s*\\([^;]*\\b${escapedVar}\\b`),
    new RegExp(`\\breturn\\s+[^;]*\\b${escapedVar}\\b`),
    new RegExp(`\\b${escapedVar}\\s*\\?`),
  ];

  return validationPatterns.some((pattern) => pattern.test(searchWindow));
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

      // Find beginning of current statement
      const lastSemi = masked.lastIndexOf(';', matchIndex);
      const lastOpenBrace = masked.lastIndexOf('{', matchIndex);
      const lastCloseBrace = masked.lastIndexOf('}', matchIndex);
      const stmtStart = Math.max(0, lastSemi + 1, lastOpenBrace + 1, lastCloseBrace + 1);

      const prefix = masked.slice(stmtStart, matchIndex);

      // Check if the call is directly checked in require, assert, if, or return
      if (isDirectlyChecked(prefix)) {
        continue;
      }

      // Check if the call return value is assigned to a variable
      const assignmentIndex = findAssignmentIndex(prefix);
      if (assignmentIndex !== -1) {
        const lhs = prefix.slice(0, assignmentIndex).trim();
        const { isAssigned, variableName } = extractAssignedVariable(lhs);

        if (isAssigned) {
          if (variableName && isVariableValidated(masked, matchIndex, variableName)) {
            // Variable was captured and subsequently validated
            continue;
          }
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
