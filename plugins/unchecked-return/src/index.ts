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
    'Detects low-level .call(), .send(), and .delegatecall() invocations where the boolean return value is not checked.',
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

interface Scope {
  start: number;
  end: number;
}

interface CallSite {
  callKind: string;
  dotIndex: number;
  callEnd: number;
  lineStart: number;
  lineEnd: number;
  codeSnippet: string;
}

export function maskCommentsAndStrings(source: string): string {
  const chars = source.split('');
  const len = chars.length;
  let i = 0;

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
          if (chars[i + 1] !== '\n') chars[i + 1] = ' ';
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
          if (chars[i + 1] !== '\n') chars[i + 1] = ' ';
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

export function extractFunctionScopes(sanitized: string): Scope[] {
  const scopes: Scope[] = [];
  const declRegex = /\b(function|constructor|modifier|receive|fallback)\b/g;
  let match: RegExpExecArray | null;

  while ((match = declRegex.exec(sanitized)) !== null) {
    let idx = match.index + match[0].length;
    let foundBrace = false;

    while (idx < sanitized.length) {
      const ch = sanitized[idx];
      if (ch === ';') {
        break;
      }
      if (ch === '{') {
        foundBrace = true;
        break;
      }
      idx++;
    }

    if (foundBrace) {
      const braceStart = idx;
      let depth = 1;
      idx++;
      while (idx < sanitized.length && depth > 0) {
        if (sanitized[idx] === '{') depth++;
        else if (sanitized[idx] === '}') depth--;
        idx++;
      }
      scopes.push({ start: braceStart, end: idx - 1 });
      declRegex.lastIndex = idx;
    } else {
      declRegex.lastIndex = idx + 1;
    }
  }

  return scopes;
}

export function getScopeForCall(scopes: Scope[], callIdx: number, totalLen: number): Scope {
  for (const s of scopes) {
    if (callIdx >= s.start && callIdx <= s.end) {
      return s;
    }
  }
  return { start: 0, end: totalLen };
}

export function parseCallSites(sanitized: string, originalSource: string): CallSite[] {
  const sites: CallSite[] = [];
  const originalLines = originalSource.split('\n');
  const callRegex = /(?<!\.)\.\s*(call|send|delegatecall)\b/g;
  let match: RegExpExecArray | null;

  while ((match = callRegex.exec(sanitized)) !== null) {
    const callKind = match[1] ?? 'call';
    const dotIndex = match.index + match[0].indexOf('.');
    let i = match.index + match[0].length;

    while (i < sanitized.length && /\s/.test(sanitized[i] ?? '')) i++;

    if (sanitized[i] === '{') {
      let braceDepth = 1;
      i++;
      while (i < sanitized.length && braceDepth > 0) {
        if (sanitized[i] === '{') braceDepth++;
        else if (sanitized[i] === '}') braceDepth--;
        i++;
      }
      while (i < sanitized.length && /\s/.test(sanitized[i] ?? '')) i++;
    }

    if (sanitized[i] !== '(') {
      continue;
    }

    let parenDepth = 1;
    i++;
    while (i < sanitized.length && parenDepth > 0) {
      if (sanitized[i] === '(') parenDepth++;
      else if (sanitized[i] === ')') parenDepth--;
      i++;
    }
    const callEnd = i;

    const lineStart = originalSource.slice(0, dotIndex).split('\n').length;
    const lineEnd = originalSource.slice(0, callEnd).split('\n').length;
    const codeSnippet = (originalLines[lineStart - 1] ?? match[0]).trim();

    sites.push({
      callKind,
      dotIndex,
      callEnd,
      lineStart,
      lineEnd,
      codeSnippet,
    });
  }

  return sites;
}

export function findStatementStart(
  sanitized: string,
  fromIndex: number,
  scopeStart: number,
): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = fromIndex - 1; i >= scopeStart; i--) {
    const ch = sanitized[i];

    if (ch === ')') {
      parenDepth++;
    } else if (ch === '(') {
      if (parenDepth > 0) parenDepth--;
    } else if (ch === ']') {
      bracketDepth++;
    } else if (ch === '[') {
      if (bracketDepth > 0) bracketDepth--;
    } else if (ch === '}') {
      braceDepth++;
    } else if (ch === '{') {
      if (braceDepth > 0) {
        braceDepth--;
      } else {
        return i + 1;
      }
    } else if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (ch === ';') {
        return i + 1;
      }
    }
  }

  return scopeStart;
}

export function findStatementEnd(sanitized: string, fromIndex: number, scopeEnd: number): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = fromIndex; i < scopeEnd; i++) {
    const ch = sanitized[i];

    if (ch === '(') {
      parenDepth++;
    } else if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
    } else if (ch === '[') {
      bracketDepth++;
    } else if (ch === ']') {
      if (bracketDepth > 0) bracketDepth--;
    } else if (ch === '{') {
      braceDepth++;
    } else if (ch === '}') {
      if (braceDepth > 0) {
        braceDepth--;
      } else {
        return i;
      }
    } else if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (ch === ';') {
        return i + 1;
      }
    }
  }

  return scopeEnd;
}

export function isValidTruthCheck(condition: string, varName: string): boolean {
  let expr = condition.trim();

  // Strip matching outer parentheses repeatedly: ((ok)) -> ok
  while (expr.startsWith('(') && expr.endsWith(')')) {
    let depth = 0;
    let outerCoversAll = true;
    for (let i = 0; i < expr.length - 1; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') depth--;
      if (depth === 0) {
        outerCoversAll = false;
        break;
      }
    }
    if (outerCoversAll) {
      expr = expr.slice(1, -1).trim();
    } else {
      break;
    }
  }

  // 1. Rejection: Negations or inequality to true or equality to false
  if (new RegExp(`!\\s*\\b${varName}\\b`).test(expr)) return false;
  if (new RegExp(`\\b${varName}\\b\\s*==\\s*false\\b`).test(expr)) return false;
  if (new RegExp(`\\bfalse\\b\\s*==\\s*\\b${varName}\\b`).test(expr)) return false;
  if (new RegExp(`\\b${varName}\\b\\s*!=\\s*true\\b`).test(expr)) return false;
  if (new RegExp(`\\btrue\\b\\s*!=\\s*\\b${varName}\\b`).test(expr)) return false;

  // 2. Rejection: Comparison to another variable/literal that is NOT boolean true
  const eqAfter = expr.match(new RegExp(`\\b${varName}\\b\\s*==\\s*([A-Za-z0-9_$]+)`));
  if (eqAfter && eqAfter[1] !== 'true') return false;

  const eqBefore = expr.match(new RegExp(`([A-Za-z0-9_$]+)\\s*==\\s*\\b${varName}\\b`));
  if (eqBefore && eqBefore[1] !== 'true') return false;

  // 3. Positive truth check patterns:
  if (new RegExp(`^\\b${varName}\\b$`).test(expr)) return true;
  if (new RegExp(`^\\b${varName}\\b\\s*==\\s*true$`).test(expr)) return true;
  if (new RegExp(`^true\\s*==\\s*\\b${varName}\\b$`).test(expr)) return true;
  if (new RegExp(`(?:^|&&)\\s*\\b${varName}\\b\\s*(?:&&|$)`).test(expr)) return true;
  if (new RegExp(`(?:^|&&)\\s*\\b${varName}\\b\\s*==\\s*true\\s*(?:&&|$)`).test(expr)) return true;
  if (new RegExp(`(?:^|&&)\\s*true\\s*==\\s*\\b${varName}\\b\\s*(?:&&|$)`).test(expr)) return true;

  return false;
}

export function isDirectlyChecked(fullStmt: string): boolean {
  // 1. Direct return: return target.send(...);
  if (/^return\b/.test(fullStmt)) {
    return true;
  }

  // 2. Direct require() or assert()
  const reqMatch = fullStmt.match(/^(?<!\.)\b(require|assert)\s*\(/);
  if (reqMatch) {
    const openParenIdx = fullStmt.indexOf('(');
    let depth = 1;
    let arg0End = -1;
    for (let i = openParenIdx + 1; i < fullStmt.length; i++) {
      const ch = fullStmt[i];
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          arg0End = i;
          break;
        }
      } else if (ch === ',' && depth === 1) {
        arg0End = i;
        break;
      }
    }

    if (arg0End !== -1) {
      const condition = fullStmt.slice(openParenIdx + 1, arg0End).trim();
      if (
        condition.startsWith('!') ||
        /\b==\s*false\b/.test(condition) ||
        /\bfalse\s*==\b/.test(condition) ||
        /\b!=\s*true\b/.test(condition) ||
        /\btrue\s*!=\b/.test(condition)
      ) {
        return false;
      }
      return true;
    }
  }

  // 3. Direct if (...) condition
  const ifMatch = fullStmt.match(/^if\s*\(/);
  if (ifMatch) {
    const openParenIdx = fullStmt.indexOf('(');
    let depth = 1;
    let condEnd = -1;
    for (let i = openParenIdx + 1; i < fullStmt.length; i++) {
      const ch = fullStmt[i];
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          condEnd = i;
          break;
        }
      }
    }

    if (condEnd !== -1) {
      const condition = fullStmt.slice(openParenIdx + 1, condEnd).trim();
      const body = fullStmt.slice(condEnd + 1).trim();

      const isNegated =
        condition.startsWith('!') ||
        /\b==\s*false\b/.test(condition) ||
        /\bfalse\s*==\b/.test(condition) ||
        /\b!=\s*true\b/.test(condition) ||
        /\btrue\s*!=\b/.test(condition);

      if (isNegated) {
        if (/\b(revert|return)\b/.test(body)) {
          return true;
        }
      } else {
        if (/\belse\b[\s\S]*?\b(revert|return)\b/.test(body)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function getAssignmentVar(stmtPrefix: string): {
  isAssigned: boolean;
  varName: string | null;
} {
  let eqIdx = -1;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < stmtPrefix.length; i++) {
    const ch = stmtPrefix[i];
    if (ch === '(') {
      parenDepth++;
    } else if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
    } else if (ch === '[') {
      bracketDepth++;
    } else if (ch === ']') {
      if (bracketDepth > 0) bracketDepth--;
    } else if (ch === '{') {
      braceDepth++;
    } else if (ch === '}') {
      if (braceDepth > 0) braceDepth--;
    } else if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && ch === '=') {
      const prev = stmtPrefix[i - 1] ?? '';
      const next = stmtPrefix[i + 1] ?? '';
      if (prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>' && next !== '=') {
        eqIdx = i;
      }
    }
  }

  if (eqIdx === -1) {
    return { isAssigned: false, varName: null };
  }

  const lhs = stmtPrefix.slice(0, eqIdx).trim();

  // Tuple assignment: (bool success, ) or (success, bytes memory data) or (, bytes memory data)
  if (lhs.startsWith('(')) {
    const tupleMatch = lhs.match(/^\(\s*(?:bool\s+)?([A-Za-z_$][\w$]*)\s*[,)]/);
    if (tupleMatch && tupleMatch[1]) {
      return { isAssigned: true, varName: tupleMatch[1] };
    }
    return { isAssigned: true, varName: null };
  }

  // Single variable assignment: bool sent = or sent =
  const singleMatch = lhs.match(/(?:\bbool\s+)?([A-Za-z_$][\w$]*)\s*$/);
  if (singleMatch && singleMatch[1]) {
    return { isAssigned: true, varName: singleMatch[1] };
  }

  return { isAssigned: true, varName: null };
}

export function isVarCheckedInScope(
  sanitized: string,
  fromIndex: number,
  scopeEnd: number,
  varName: string,
): boolean {
  const varRegex = new RegExp(`\\b${varName}\\b`, 'g');
  varRegex.lastIndex = fromIndex;

  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(sanitized)) !== null) {
    if (match.index >= scopeEnd) {
      break;
    }

    const occurrenceIdx = match.index;
    const stmtStart = findStatementStart(sanitized, occurrenceIdx, fromIndex);
    const stmtEnd = findStatementEnd(sanitized, occurrenceIdx, scopeEnd);
    const stmtText = sanitized.slice(stmtStart, stmtEnd).trim();

    // 1. Reassignment check: varName is on the LHS of an assignment
    const singleReassign = new RegExp(
      `^(?:bool\\s+)?\\b${varName}\\b\\s*(?:=(?!=)|\\+=|-=|\\*=|/=|%=|&=|\\|=|\\^=)`,
    ).test(stmtText);
    const tupleReassign = new RegExp(
      `^\\(\\s*(?:bool\\s+)?\\b${varName}\\b\\s*[,)][^;=]*=\\s*[^=]`,
    ).test(stmtText);

    if (singleReassign || tupleReassign) {
      return false;
    }

    // 2. require() or assert() validation
    const reqMatch = stmtText.match(/^(?<!\.)\b(require|assert)\s*\(/);
    if (reqMatch) {
      const openParenIdx = stmtText.indexOf('(');
      let depth = 1;
      let arg0End = -1;
      for (let i = openParenIdx + 1; i < stmtText.length; i++) {
        const ch = stmtText[i];
        if (ch === '(' || ch === '{' || ch === '[') depth++;
        else if (ch === ')' || ch === '}' || ch === ']') {
          depth--;
          if (depth === 0) {
            arg0End = i;
            break;
          }
        } else if (ch === ',' && depth === 1) {
          arg0End = i;
          break;
        }
      }

      if (arg0End !== -1) {
        const cond = stmtText.slice(openParenIdx + 1, arg0End).trim();
        if (isValidTruthCheck(cond, varName)) {
          return true;
        }
      }
    }

    // 3. if (...) condition validation
    const ifMatch = stmtText.match(/^if\s*\(/);
    if (ifMatch) {
      const openParenIdx = stmtText.indexOf('(');
      let depth = 1;
      let condEnd = -1;
      for (let i = openParenIdx + 1; i < stmtText.length; i++) {
        const ch = stmtText[i];
        if (ch === '(' || ch === '{' || ch === '[') depth++;
        else if (ch === ')' || ch === '}' || ch === ']') {
          depth--;
          if (depth === 0) {
            condEnd = i;
            break;
          }
        }
      }

      if (condEnd !== -1) {
        const cond = stmtText.slice(openParenIdx + 1, condEnd).trim();
        const body = stmtText.slice(condEnd + 1).trim();

        const isNegated =
          new RegExp(`!\\s*\\b${varName}\\b`).test(cond) ||
          new RegExp(`\\b${varName}\\b\\s*==\\s*false\\b`).test(cond) ||
          new RegExp(`\\bfalse\\b\\s*==\\s*\\b${varName}\\b`).test(cond) ||
          new RegExp(`\\b${varName}\\b\\s*!=\\s*true\\b`).test(cond) ||
          new RegExp(`\\btrue\\b\\s*!=\\s*\\b${varName}\\b`).test(cond);

        if (isNegated) {
          if (/\b(revert|return)\b/.test(body)) {
            return true;
          }
        } else if (isValidTruthCheck(cond, varName)) {
          if (/\belse\b[\s\S]*?\b(revert|return)\b/.test(body)) {
            return true;
          }
        }
      }
    }

    // 4. return statement
    if (/^return\b/.test(stmtText) && new RegExp(`\\b${varName}\\b`).test(stmtText)) {
      return true;
    }
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
    const sanitized = maskCommentsAndStrings(sourceCode);
    const scopes = extractFunctionScopes(sanitized);
    const callSites = parseCallSites(sanitized, sourceCode);

    for (const site of callSites) {
      const scope = getScopeForCall(scopes, site.dotIndex, sanitized.length);
      const stmtStart = findStatementStart(sanitized, site.dotIndex, scope.start);
      const stmtEnd = findStatementEnd(sanitized, site.callEnd, scope.end);
      const fullStmt = sanitized.slice(stmtStart, stmtEnd).trim();

      if (isDirectlyChecked(fullStmt)) {
        continue;
      }

      const prefix = sanitized.slice(stmtStart, site.dotIndex);
      const { isAssigned, varName } = getAssignmentVar(prefix);

      if (isAssigned && varName !== null) {
        if (isVarCheckedInScope(sanitized, stmtEnd, scope.end, varName)) {
          continue;
        }
      }

      const description = varName
        ? `Low-level .${site.callKind}() return value is captured in '${varName}' but never validated with require() or a reverting check. Failed calls continue execution silently (SWC-104).`
        : `Low-level .${site.callKind}() return value is ignored. Low-level calls return a boolean indicating success or failure. If unhandled, failed calls continue execution silently (SWC-104).`;

      findings.push({
        pluginId: this.metadata.id,
        title: `Unchecked Return Value from .${site.callKind}()`,
        description,
        severity: this.metadata.severity,
        filePath: `${context.contractName}.sol`,
        lineStart: site.lineStart,
        lineEnd: site.lineEnd,
        codeSnippet: site.codeSnippet,
        recommendation: `Verify the return value using require(success, "Call failed") or revert on failure.`,
        confidence: 0.9,
        references: this.metadata.references ?? [],
      });
    }

    findings.sort((a, b) => a.lineStart - b.lineStart);
    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the unchecked return value at ${finding.filePath}:${finding.lineStart}:

1. Capture the boolean return value from the low-level call.
2. Check the return value using require(success, "Call failed") or revert on failure.

Example fix:
\`\`\`solidity
(bool success, ) = recipient.call{value: amount}("");
require(success, "Call failed");
\`\`\`

For .send():
\`\`\`solidity
bool success = recipient.send(amount);
require(success, "Send failed");
\`\`\`

For .delegatecall():
\`\`\`solidity
(bool success, bytes memory data) = target.delegatecall(callData);
require(success, "Delegatecall failed");
\`\`\`

Note: Native address.transfer() reverts automatically on failure and does not require a return value check.`;
  }

  supportsContext(context: AnalysisContext): boolean {
    const languageSupported =
      !context.language || this.metadata.languages.includes(context.language);
    const chainSupported = !context.chain || this.metadata.chains.includes(context.chain);
    return languageSupported && chainSupported;
  }
}
