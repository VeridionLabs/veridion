import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

/**
 * Unchecked low-level call return value detector.
 *
 * Detects `.call()`, `.send()` and `.delegatecall()` invocations (including the
 * pre-0.5 option forms `.call.value(x)(...)` / `.call.gas(x)(...)`) whose
 * boolean success result is silently discarded, i.e.:
 *   - the call's return value is never captured (standalone statement), or
 *   - it is captured (`(bool success, ) = x.call(...)`, `bool sent = x.send(...)`,
 *     later re-assignment, ...) but never enforced by a check that halts when
 *     the call FAILED: `require(success)`/`assert(success)` conditions that
 *     require success, or an `if` whose failing path reverts/returns. Guards
 *     that only act on success (`if (ok) revert()`, `require(!ok)`,
 *     `require(ok || allowFailure)`, `if (!ok && x) revert()`) do NOT count,
 *     and a halt inside a nested conditional does not count as a halt.
 *
 * `.transfer()` is deliberately NOT detected: `address.transfer()` reverts on
 * failure and does NOT return a boolean, so an "unchecked boolean return value"
 * does not exist for it. (ERC-20 style `token.transfer()` does return a bool, but
 * distinguishing it from `address.transfer()` requires type information; that is a
 * separate rule and out of scope here.)
 *
 * Scope model (no parser/AST, consistent with the repo's lightweight plugins):
 * source is analysed one sanitized copy at a time — comments and string literals
 * are blanked out first so they can neither trigger nor suppress findings.
 * Function-like blocks (`function`/`constructor`/`modifier`/`fallback`/`receive`)
 * are tracked by brace depth. Captured variables are tracked per function block
 * in a LIFO stack: a guard validates the most recent capture of that name *within
 * the same function and after the call*. A `require(success)` in another function
 * therefore never validates this function's call, a guard written before the call
 * cannot shield it, one guard cannot validate several calls at once, and any
 * assignment (plain or tuple) that overwrites a still-unchecked capture is
 * reported: the call result was discarded before any guard could read it.
 *
 * Known limitations (deliberate, heuristic trade-offs):
 *   - `assembly { ... call(...) }` is invisible to textual scanning.
 *   - A boolean state variable assigned in function A and required in function B
 *     is still reported: textual analysis cannot prove that cross-function flow.
 *   - A contract/interface function coincidentally named `call`/`send` invoked as
 *     a member (`iface.send(x)`) is treated as a low-level call (rare; requires
 *     type resolution to disambiguate).
 *   - Path analysis is deliberately conservative: an `if` body counts as halting
 *     only when it contains an unconditional top-level `revert`/`return`/`throw`;
 *     `require`/`assert` inside a body do not count, and paren-wrapped double
 *     negation such as `require(!(!ok))` is treated as a negation.
 *   - `do { } while` bodies are treated conservatively as loops: a guard inside
 *     a `do` body after a top-level capture is still reported, even though a
 *     `do` body is guaranteed to run at least once. (Keeping the loop rules
 *     uniform; regression tests: "brace-less do-while body", "capture in a do
 *     loop guarded only after the loop".)
 */

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Low-Level Call Return Value Detector',
  version: '1.0.0',
  description:
    'Detects low-level .call(), .send() and .delegatecall() invocations whose boolean return value is never checked, which can let failures pass silently. address.transfer() is intentionally not flagged: it reverts on failure and returns no boolean.',
  severity: FindingSeverity.MEDIUM,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: [
    'unchecked-return',
    'unchecked-call',
    'unchecked-send',
    'delegatecall',
    'low-level-call',
    'swc-104',
  ],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/unchecked-call-return-value/',
  ],
};

/** Member call names this plugin cares about. */
type LowLevelCallKind = 'call' | 'send' | 'delegatecall';

/**
 * Scan `text` for genuine low-level member call sites: `.call`, `.send` or
 * `.delegatecall` (whole word), optionally followed by pre-0.5 option chains
 * (`.value(...)`, `.gas(...)`, ... — argument parentheses may nest), then `(` or
 * `{`. Lookalikes (`callSomething(`, `.callback(`, `abi.encodeCall(`) do not
 * match because the member name is required as a whole word.
 */
function scanCallTokens(text: string): Array<{ dotIdx: number; kind: LowLevelCallKind }> {
  const results: Array<{ dotIdx: number; kind: LowLevelCallKind }> = [];
  const re = /\.(\s*)(call|send|delegatecall)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const dotIdx = m.index;
    const kind = m[2] as LowLevelCallKind;
    const nameEnd = dotIdx + 1 + (m[1] as string).length + kind.length;
    let pos = nameEnd;
    let valid = false;
    for (;;) {
      while (pos < text.length && /\s/.test(text[pos] as string)) pos += 1;
      if (pos >= text.length) break;
      const c = text[pos] as string;
      if (c === '(' || c === '{') {
        valid = true;
        break;
      }
      if (c !== '.') break;
      // legacy option chain: .value(...) / .gas(...) with balanced parens
      pos += 1;
      while (pos < text.length && /\s/.test(text[pos] as string)) pos += 1;
      const optMatch = text.slice(pos).match(/^[A-Za-z_$][\w$]*/);
      if (!optMatch) break;
      pos += optMatch[0].length;
      while (pos < text.length && /\s/.test(text[pos] as string)) pos += 1;
      if (text[pos] !== '(') break;
      const close = findMatching(text, pos, '(', ')');
      if (close === -1) break;
      pos = close + 1;
    }
    if (valid) results.push({ dotIdx, kind });
  }
  return results;
}

function countCallMembers(text: string): number {
  return scanCallTokens(text).length;
}

/** Function-like headers that open a scoped block (region). */
const FN_HEADER_RE = /\b(function|constructor|modifier|fallback|receive)\b/;

/** Keywords of statements that unconditionally halt a branch. */
const UNCONDITIONAL_HALT_STMT_RE = /^(revert|return|throw|selfdestruct)\b/;

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Blank out comments (line and block) and string/hex literals while keeping
 * offsets and newlines intact, so detections can neither come from nor be
 * suppressed by non-code text.
 */
function sanitizeSource(source: string): string {
  const out = new Array<string>(source.length);
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i] as string;
    const next = i + 1 < n ? (source[i + 1] as string) : '';
    if (ch === '/' && next === '/') {
      // line comment
      while (i < n && source[i] !== '\n') {
        out[i] = ' ';
        i += 1;
      }
    } else if (ch === '/' && next === '*') {
      // block comment
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
    } else if (ch === '"' || ch === "'") {
      // string / hex / unicode literal
      const quote = ch;
      out[i] = ' ';
      i += 1;
      while (i < n) {
        const c = source[i] as string;
        if (c === '\\') {
          out[i] = ' ';
          if (i + 1 < n) {
            out[i + 1] = ' ';
            i += 2;
          } else {
            i += 1;
          }
        } else if (c === quote) {
          out[i] = ' ';
          i += 1;
          break;
        } else {
          out[i] = c === '\n' ? '\n' : ' ';
          i += 1;
        }
      }
    } else {
      out[i] = ch;
      i += 1;
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// Line / region bookkeeping (brace-depth based, no parser)
// ---------------------------------------------------------------------------

interface Region {
  id: number;
  openIdx: number;
  closeIdx: number;
}

function buildRegions(sanitized: string): Region[] {
  const regions: Region[] = [];
  const pending: Array<{ openIdx: number; depthBefore: number }> = [];
  let depth = 0;
  let boundary = 0;

  for (let i = 0; i < sanitized.length; i++) {
    const c = sanitized[i] as string;
    if (c === '{') {
      if (depth <= 1) {
        const header = sanitized.slice(boundary, i);
        if (FN_HEADER_RE.test(header)) {
          pending.push({ openIdx: i, depthBefore: depth });
        }
        boundary = i + 1;
      }
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      const top = pending.length > 0 ? pending[pending.length - 1] : undefined;
      if (top && top.depthBefore === depth) {
        pending.pop();
        regions.push({ id: regions.length, openIdx: top.openIdx, closeIdx: i });
      }
      if (depth <= 1) {
        boundary = i + 1;
      }
    } else if (c === ';' && depth <= 1) {
      boundary = i + 1;
    }
  }
  return regions;
}

function regionAt(regions: Region[], idx: number): Region | null {
  for (const region of regions) {
    if (idx >= region.openIdx && idx <= region.closeIdx) {
      return region;
    }
  }
  return null;
}

function lineOf(lineStarts: number[], idx: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((lineStarts[mid] as number) <= idx) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1; // 1-based
}

function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

// ---------------------------------------------------------------------------
// Balanced delimiter scans (operate on sanitized text)
// ---------------------------------------------------------------------------

function findMatching(sanitized: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < sanitized.length; i++) {
    const c = sanitized[i] as string;
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Consume the body of an if-branch starting at `i` (a `{...}` block or a single
 * statement up to `;`). Returns the consumed text and the next index.
 */
function takeBody(sanitized: string, i: number): { text: string; next: number } {
  while (i < sanitized.length && /\s/.test(sanitized[i] as string)) i += 1;
  if (i >= sanitized.length) return { text: '', next: i };
  if (sanitized[i] === '{') {
    const close = findMatching(sanitized, i, '{', '}');
    if (close === -1) return { text: '', next: i };
    return { text: sanitized.slice(i, close + 1), next: close + 1 };
  }
  const semi = sanitized.indexOf(';', i);
  if (semi === -1) return { text: '', next: i };
  return { text: sanitized.slice(i, semi + 1), next: semi + 1 };
}

/**
 * True when every path through `bodyText` halts: it contains an unconditional
 * top-level `revert`/`return`/`throw`/`selfdestruct` statement. Halts nested
 * inside `if`/`while`/`for`/brace blocks do NOT count (the failing path could
 * skip them), and neither do `require`/`assert` (they only halt conditionally).
 */
function unconditionallyHalts(bodyText: string): boolean {
  let t = bodyText.trim();
  if (t.startsWith('{')) {
    const close = findMatching(t, 0, '{', '}');
    if (close === t.length - 1) t = t.slice(1, close).trim();
  }
  let depth = 0;
  let stmtStart = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string;
    if (c === '(' || c === '[' || c === '{') {
      depth += 1;
    } else if (c === ')' || c === ']') {
      depth -= 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) stmtStart = i + 1;
    } else if (c === ';' && depth === 0) {
      const stmt = t.slice(stmtStart, i).trim();
      if (UNCONDITIONAL_HALT_STMT_RE.test(stmt)) return true;
      stmtStart = i + 1;
    }
  }
  return false;
}

interface IfBodyInfo {
  thenHalts: boolean;
  hasElse: boolean;
  elseHalts: boolean;
}

/** Split an `if (cond)` statement's then/else bodies and test each for halting. */
function parseIfBody(sanitized: string, condClose: number): IfBodyInfo {
  const then = takeBody(sanitized, condClose + 1);
  const thenHalts = unconditionallyHalts(then.text);
  let j = then.next;
  while (j < sanitized.length && /\s/.test(sanitized[j] as string)) j += 1;
  if (sanitized.startsWith('else', j)) {
    const elsePart = takeBody(sanitized, j + 4);
    return { thenHalts, hasElse: true, elseHalts: unconditionallyHalts(elsePart.text) };
  }
  return { thenHalts, hasElse: false, elseHalts: false };
}

/** Remove one or more layers of wrapping parentheses that fully enclose `text`. */
function stripOuterParens(text: string): string {
  let t = text.trim();
  for (;;) {
    if (!t.startsWith('(') || !t.endsWith(')')) return t;
    let depth = 0;
    let fullyWraps = true;
    for (let i = 0; i < t.length; i++) {
      const c = t[i] as string;
      if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0 && i < t.length - 1) {
          fullyWraps = false;
          break;
        }
      }
    }
    if (!fullyWraps || depth !== 0) return t;
    t = t.slice(1, -1).trim();
  }
}

interface CondPart {
  text: string;
  /** Offset of the part within the scanned text. */
  start: number;
}

/** Split a condition on top-level `||` operators (outside parens/brackets). */
function splitTopLevelOrRaw(text: string): CondPart[] {
  const parts: CondPart[] = [];
  let depth = 0;
  let curStart = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    if (depth === 0 && c === '|' && text[i + 1] === '|') {
      parts.push({ text: text.slice(curStart, i), start: curStart });
      curStart = i + 2;
      i += 1;
    }
  }
  parts.push({ text: text.slice(curStart), start: curStart });
  return parts
    .map((p) => ({ text: p.text.trim(), start: p.start }))
    .filter((p) => p.text.length > 0);
}

function splitTopLevelOr(text: string): string[] {
  return splitTopLevelOrRaw(text).map((p) => p.text);
}

type VarUsage = 'positive' | 'negative' | 'mixed' | 'none';

/**
 * How one top-level `||`-disjunct of a guard condition uses the captured
 * variable: positively (`ok`, `ok && x`, `ok == true`, `!!ok`), negatively
 * (`!ok`, `ok == false`), ambiguously (mixed/comparison usage), or not at all.
 */
function classifyVarUsage(part: string, varName: string): VarUsage {
  const re = new RegExp(`\\b${escapeRegExp(varName)}\\b`, 'g');
  let hasPositive = false;
  let hasNegative = false;
  let hasMixed = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(part)) !== null) {
    // scan backwards across `!`/parenthesis wrappers to learn how the variable
    // is used: `!!ok` and `!(!ok)` are positive, `!ok` is negative, `x == ok`
    // is a right-hand-side comparison (ambiguous), `f(ok)` is fn-wrapped
    let prev = m.index - 1;
    let bangs = 0;
    let rhsCompare = false;
    let comparePos = -1;
    let fnWrapped = false;
    for (;;) {
      while (prev >= 0 && /\s/.test(part[prev] as string)) prev -= 1;
      if (prev < 0) break;
      const pc = part[prev] as string;
      if (pc === '!') {
        bangs += 1;
        prev -= 1;
        continue;
      }
      if (pc === '(') {
        // unwrap one parenthesis layer around the variable and keep scanning
        prev -= 1;
        continue;
      }
      if (pc === '=' || pc === '<' || pc === '>') {
        rhsCompare = true;
        comparePos = prev;
      } else if (/[\w$]/.test(pc)) {
        fnWrapped = true; // f(ok): wrapped in a call
      }
      break;
    }
    const negated = bangs % 2 === 1;
    // literal boolean on the left of a comparison: `true == ok` requires ok,
    // `false == ok` requires !ok — anything else (`x == ok`) is ambiguous
    let rhsLiteral: 'positive' | 'negative' | null = null;
    if (rhsCompare && !fnWrapped) {
      const prefix = part.slice(0, comparePos + 1);
      const lit = prefix.match(/(true|false)\s*(==|!=)\s*$/);
      if (lit) {
        const isTrue = (lit[1] as string) === 'true';
        const isEq = (lit[2] as string) === '==';
        rhsLiteral = (isTrue && isEq) || (!isTrue && !isEq) ? 'positive' : 'negative';
      }
    }
    let next = m.index + varName.length;
    while (next < part.length && /\s/.test(part[next] as string)) next += 1;
    const rest = part.slice(next);
    if (negated) {
      hasNegative = true;
    } else if (rhsLiteral === 'positive') {
      hasPositive = true;
    } else if (rhsLiteral === 'negative') {
      hasNegative = true;
    } else if (rhsCompare || fnWrapped) {
      hasMixed = true;
    } else if (rest.startsWith('==') || rest.startsWith('!=')) {
      const cmp = rest.match(/^(==|!=)/)?.[0] ?? '';
      const target = rest.slice(cmp.length).trim();
      if (
        (cmp === '==' && target.startsWith('true')) ||
        (cmp === '!=' && target.startsWith('false'))
      ) {
        hasPositive = true;
      } else if (
        (cmp === '==' && target.startsWith('false')) ||
        (cmp === '!=' && target.startsWith('true'))
      ) {
        hasNegative = true;
      } else {
        hasMixed = true;
      }
    } else {
      hasPositive = true;
    }
  }
  if (hasMixed) return 'mixed';
  if (hasNegative) return hasPositive ? 'mixed' : 'negative';
  if (hasPositive) return 'positive';
  return 'none';
}

/** Split a condition on top-level `&&` operators (outside parens/brackets). */
function splitTopLevelAndRaw(text: string): CondPart[] {
  const parts: CondPart[] = [];
  let depth = 0;
  let curStart = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    if (depth === 0 && c === '&' && text[i + 1] === '&') {
      parts.push({ text: text.slice(curStart, i), start: curStart });
      curStart = i + 2;
      i += 1;
    }
  }
  parts.push({ text: text.slice(curStart), start: curStart });
  return parts
    .map((p) => ({ text: p.text.trim(), start: p.start }))
    .filter((p) => p.text.length > 0);
}

/**
 * A conjunction term "requires ok" when it can only be true if ok is true:
 * it contains ok used positively (no negation, no equality on either side,
 * no function wrapper), and no `||` or ternary anywhere that could let the
 * term hold without ok. Example: `(a || b) && ok` is split into terms, and
 * the `ok` term alone satisfies the requirement.
 */
function termRequiresVar(termText: string, varName: string): boolean {
  const t = termText.trim();
  if (t.length === 0) return false;
  if (t.includes('||') || t.includes('?')) return false;
  return classifyVarUsage(t, varName) === 'positive';
}

function partRequiresVar(part: string, varName: string): boolean {
  const terms = splitTopLevelAndRaw(part);
  if (terms.length === 0) return false;
  return terms.some((term) => termRequiresVar(term.text, varName));
}

/**
 * require/assert halts unless the condition holds; they validate a captured
 * call result only when the condition implies the result is true. Every
 * top-level `||`-disjunct must itself imply the variable (each disjunct needs
 * an `&&`-term that positively requires it). This rejects `require(!ok)`,
 * `require(ok || allowFailure)` and `require(allowFailure == ok)`.
 */
function requireGuardValid(condText: string, varName: string): boolean {
  const parts = splitTopLevelOr(stripOuterParens(condText));
  if (parts.length === 0) return false;
  return parts.every((p) => partRequiresVar(p, varName));
}

/**
 * True when a top-level disjunct is exactly `!ok` — possibly parenthesised
 * (`!(ok)`), written as `ok == false` / `ok != true`, or literal-reversed
 * (`false == ok` / `true != ok`).
 */
function isPureNegation(part: string, varName: string): boolean {
  const v = escapeRegExp(varName);
  let p = stripOuterParens(part).trim();
  if (p.startsWith('!')) {
    p = stripOuterParens(p.replace(/^!\s*/, '')).trim();
    return p === varName;
  }
  // var on the left of the comparison
  if (new RegExp(`^${v}\\s*(==\\s*false|!=\\s*true)\\s*$`).test(p)) return true;
  // literal on the left of the comparison: `false == ok`, `true != ok`
  const reversed = p.match(/^(true|false)\s*(==|!=)\s*(.*)$/);
  if (!reversed) return false;
  const literal = reversed[1] as string;
  const op = reversed[2] as string;
  const rest = stripOuterParens((reversed[3] as string).trim()).trim();
  if (rest !== varName) return false;
  return (literal === 'false' && op === '==') || (literal === 'true' && op === '!=');
}

/**
 * An `if` only validates a captured call result when the failing path
 * (result == false) halts. If some top-level disjunct is a pure negation
 * (`!ok`), the failure path runs the then-branch, so it must halt. Otherwise
 * failure falls to the else branch (or falls through): the else branch must
 * halt AND the condition must imply ok (no alternative true-path when ok is
 * false — `if (ok || x) work(); else revert();` does NOT validate ok).
 * Ambiguous disjuncts are treated as not validating.
 */
function ifGuardValid(
  sanitized: string,
  condText: string,
  condClose: number,
  varName: string,
): boolean {
  const body = parseIfBody(sanitized, condClose);
  const parts = splitTopLevelOr(stripOuterParens(condText));
  if (parts.length === 0) return false;
  if (parts.some((p) => isPureNegation(p, varName))) return body.thenHalts;
  return body.hasElse && body.elseHalts && parts.every((p) => partRequiresVar(p, varName));
}

// ---------------------------------------------------------------------------
// Inline-guard analysis (the call itself sits inside the guard condition)
// ---------------------------------------------------------------------------

/**
 * How the receiver expression of a member call is used inside a guard
 * condition: directly negated (`!a.call(...)`, `!!` cancels), compared
 * (`x == a.call(...)`), wrapped in another function/ternary (`f(a.call())`,
 * `a.call() ? x : y`), or plain. A `(` that belongs to the guard itself
 * (`require(a.call(...))`) is not a wrapper.
 */
function receiverUsageAt(
  sanitized: string,
  idx: number,
): 'negated' | 'compared' | 'wrapped' | 'plain' {
  let pos = idx - 1;
  let bangs = 0;
  let compared = false;
  for (;;) {
    while (pos >= 0 && /\s/.test(sanitized[pos] as string)) pos -= 1;
    if (pos < 0) break;
    const c = sanitized[pos] as string;
    if (c === ')' || c === ']') {
      const close = c;
      const open = c === ')' ? '(' : '[';
      let depth = 0;
      let found = -1;
      for (let i = pos; i >= 0; i--) {
        const cc = sanitized[i] as string;
        if (cc === close) depth += 1;
        else if (cc === open) {
          depth -= 1;
          if (depth === 0) {
            found = i;
            break;
          }
        }
      }
      if (found === -1) break;
      pos = found - 1;
      continue;
    }
    if (/[\w$]/.test(c)) {
      while (pos >= 0 && /[\w$]/.test(sanitized[pos] as string)) pos -= 1;
      continue;
    }
    if (c === '!') {
      bangs += 1;
      pos -= 1;
      continue;
    }
    if (c === '(') {
      // a `(` directly before the receiver is either the guard's own opening
      // paren or the open paren of a wrapping call; `!` before it is a
      // negation of a parenthesised operand (`!(!a.call(...))` unwraps)
      let back = pos - 1;
      while (back >= 0 && /\s/.test(sanitized[back] as string)) back -= 1;
      if (back >= 0 && sanitized[back] === '!') {
        pos = back;
        continue;
      }
      if (back >= 0 && /[\w$]/.test(sanitized[back] as string)) {
        let start = back;
        while (start >= 0 && /[\w$]/.test(sanitized[start] as string)) start -= 1;
        const word = sanitized.slice(start + 1, back + 1);
        if (word === 'require' || word === 'assert' || word === 'if') break;
        // a function wrapper (`foo(a.call(...))`) — its result is unknown
        return 'wrapped';
      }
      // a bare grouping paren: safe when it wraps exactly the whole call
      // expression (`require((a.send(1)), ...)`, `((a.send(1)))`), i.e. its
      // matching close sits in the run of `)` chars right after the call —
      // otherwise opaque (`(a.send(1) + 1)` is a different expression)
      const callEndG = callExprEndAt(sanitized, idx);
      let runEnd = callEndG;
      if (runEnd !== -1) {
        while (runEnd < sanitized.length && sanitized[runEnd] === ')') runEnd += 1;
      }
      const close = findMatching(sanitized, pos, '(', ')');
      if (close !== -1 && runEnd !== -1 && close < runEnd && close >= callEndG - 1) {
        pos = pos - 1;
        continue;
      }
      return 'wrapped';
    }
    if (c === '=' || c === '<' || c === '>') {
      compared = true;
      break;
    }
    if (c === '?') return 'wrapped';
    break;
  }
  if (compared) return 'compared';
  return bangs % 2 === 1 ? 'negated' : 'plain';
}

/**
 * Peel fully-enclosing plain-paren groups off a span: `((a.send(1)))` narrows
 * to `a.send(1)`. Grouping parens never change a condition's meaning, so the
 * analyzers below may normalize before classifying. Returns the narrowed
 * span (whitespace-trimmed).
 */
function peelOuterParens(
  sanitized: string,
  start: number,
  end: number,
): { start: number; end: number } {
  for (;;) {
    let s = start;
    while (s < end && /\s/.test(sanitized[s] as string)) s += 1;
    if (s >= end || sanitized[s] !== '(') break;
    const close = findMatching(sanitized, s, '(', ')');
    if (close === -1) break;
    let t = close + 1;
    while (t < end && /\s/.test(sanitized[t] as string)) t += 1;
    if (t !== end) break;
    start = s + 1;
    end = close;
  }
  while (start < end && /\s/.test(sanitized[start] as string)) start += 1;
  while (end > start && /\s/.test(sanitized[end - 1] as string)) end -= 1;
  return { start, end };
}

/**
 * True when a top-level condition disjunct (given as an absolute span) is
 * exactly `!<this low-level call>` — i.e. the call result is the whole,
 * negated condition of an `if`, so the then-branch runs exactly on failure.
 */
function partIsPureNegatedCall(
  sanitized: string,
  absStart: number,
  absEnd: number,
  dotIdx: number,
): boolean {
  if (dotIdx < absStart || dotIdx > absEnd) return false;
  const peeled = peelOuterParens(sanitized, absStart, absEnd);
  absStart = peeled.start;
  absEnd = peeled.end;
  if (dotIdx < absStart || dotIdx > absEnd) return false;
  const span = sanitized.slice(absStart, absEnd);
  const bangIdx = span.search(/\S/);
  if (bangIdx === -1 || span[bangIdx] !== '!') return false;
  // strip the leading `!` and any wrapping parentheses around the operand
  let innerStart = absStart + bangIdx + 1;
  while (innerStart < absEnd && /\s/.test(sanitized[innerStart] as string)) innerStart += 1;
  let innerEnd = absEnd;
  for (;;) {
    // peel one fully-wrapping paren layer (possibly after further ws)
    let open = innerStart;
    while (open < innerEnd && /\s/.test(sanitized[open] as string)) open += 1;
    if (open >= innerEnd || sanitized[open] !== '(') break;
    const close = findMatching(sanitized, open, '(', ')');
    if (close === -1 || close !== innerEnd - 1) break;
    innerStart = open + 1;
    innerEnd = close;
  }
  while (innerStart < innerEnd && /\s/.test(sanitized[innerStart] as string)) innerStart += 1;
  while (innerEnd > innerStart && /\s/.test(sanitized[innerEnd - 1] as string)) innerEnd -= 1;
  if (innerStart >= innerEnd) return false;
  // the operand must start exactly at the receiver and end exactly at the
  // call's closing paren: no function wrappers (`!invert(a.call(...))`),
  // extra negations (`!!a.call(...)`), comparisons or member access
  const recvStart = receiverStartAt(sanitized, dotIdx);
  const callEnd = callExprEndAt(sanitized, dotIdx);
  if (callEnd === -1) return false;
  if (recvStart !== innerStart || callEnd !== innerEnd) return false;
  return true;
}

/**
 * True when the whole top-level disjunct (span [absStart, absEnd)) is a
 * failure comparison of THIS call — `<call> == false`, `<call> != true`,
 * `false == <call>` or `true != <call>` — i.e. the condition holds exactly
 * when the call fails, so the then-branch runs on failure.
 */
function partIsFailureComparison(
  sanitized: string,
  absStart: number,
  absEnd: number,
  dotIdx: number,
): boolean {
  if (dotIdx < absStart || dotIdx > absEnd) return false;
  const recvStart0 = receiverStartAt(sanitized, dotIdx);
  const callEnd0 = callExprEndAt(sanitized, dotIdx);
  if (callEnd0 === -1) return false;
  // whole-span wrappers: `(a.send(1) == false)` vs the bare comparison
  const peeled = peelOuterParens(sanitized, absStart, absEnd);
  const start = peeled.start;
  const end = peeled.end;
  if (dotIdx < start || dotIdx > end) return false;
  let prefix = sanitized.slice(start, recvStart0).trim();
  let tail = sanitized.slice(callEnd0, end).trim();
  // call-side grouping pairs: `(a.send(1)) == false` / `false == (a.send(1))`
  for (;;) {
    if (prefix.endsWith('(') && tail.startsWith(')')) {
      prefix = prefix.slice(0, -1).trimEnd();
      tail = tail.slice(1).trimStart();
      continue;
    }
    break;
  }
  const callFirst = (tail === '== false' || tail === '!= true') && prefix.length === 0;
  const callLast = (prefix === 'false ==' || prefix === 'true !=') && tail.length === 0;
  return callFirst || callLast;
}

/**
 * Absolute end index (exclusive) of the low-level call expression that starts
 * at member dot `dotIdx` (receiver + `.name` + option chain + `(...)` args),
 * or -1 when the token at `dotIdx` is not followed by a complete call.
 */
function callExprEndAt(sanitized: string, dotIdx: number): number {
  let pos = dotIdx + 1;
  while (pos < sanitized.length && /\s/.test(sanitized[pos] as string)) pos += 1;
  const nameMatch = sanitized.slice(pos).match(/^[A-Za-z_$][\w$]*/);
  if (!nameMatch) return -1;
  pos += nameMatch[0].length;
  for (;;) {
    while (pos < sanitized.length && /\s/.test(sanitized[pos] as string)) pos += 1;
    if (pos >= sanitized.length) return -1;
    const c = sanitized[pos] as string;
    if (c === '(' || c === '{') {
      if (c === '{') {
        // value/gas brace options: consume them, then keep scanning for the
        // call's own argument parens
        const close = findMatching(sanitized, pos, '{', '}');
        if (close === -1) return -1;
        pos = close + 1;
        continue;
      }
      const close = findMatching(sanitized, pos, '(', ')');
      return close === -1 ? -1 : close + 1;
    }
    if (c !== '.') return -1;
    pos += 1;
    while (pos < sanitized.length && /\s/.test(sanitized[pos] as string)) pos += 1;
    const optMatch = sanitized.slice(pos).match(/^[A-Za-z_$][\w$]*/);
    if (!optMatch) return -1;
    pos += optMatch[0].length;
    while (pos < sanitized.length && /\s/.test(sanitized[pos] as string)) pos += 1;
    if (sanitized[pos] !== '(') return -1;
    const close = findMatching(sanitized, pos, '(', ')');
    if (close === -1) return -1;
    pos = close + 1;
  }
}

/** Absolute start index of the receiver expression of the call at `dotIdx`. */
function receiverStartAt(sanitized: string, dotIdx: number): number {
  let pos = dotIdx - 1;
  for (;;) {
    while (pos >= 0 && /\s/.test(sanitized[pos] as string)) pos -= 1;
    if (pos < 0) return 0;
    const c = sanitized[pos] as string;
    if (c === ')' || c === ']') {
      const close = c;
      const open = c === ')' ? '(' : '[';
      let depth = 0;
      let found = -1;
      for (let i = pos; i >= 0; i--) {
        const cc = sanitized[i] as string;
        if (cc === close) depth += 1;
        else if (cc === open) {
          depth -= 1;
          if (depth === 0) {
            found = i;
            break;
          }
        }
      }
      if (found === -1) return 0;
      pos = found - 1;
      continue;
    }
    if (/[\w$]/.test(c)) {
      while (pos >= 0 && /[\w$]/.test(sanitized[pos] as string)) pos -= 1;
      continue;
    }
    if (c === '.') {
      // member chain receiver (a.b.call): keep walking left
      pos -= 1;
      continue;
    }
    // terminator found: receiver starts at the first non-space char after it
    let start = pos + 1;
    while (start < sanitized.length && /\s/.test(sanitized[start] as string)) start += 1;
    return start;
  }
}

/**
 * True when the top-level condition disjunct `partText` (absolute span
 * [partAbsStart, partAbsEnd)) implies THIS call's result is true: the call
 * occurs in some `&&`-term of the disjunct, that term is free of `||` and
 * ternaries, the call's receiver is used plainly, and nothing follows the
 * call except a positive comparison (`== true`, `!= false`) or a require
 * message. `require(a.send(1) == false)`, `require(!a.send(1))` and
 * `require(f(a.send(1)))` therefore do not validate the call.
 */
function partRequiresCall(
  sanitized: string,
  partText: string,
  partAbsStart: number,
  dotIdx: number,
): boolean {
  if (dotIdx < partAbsStart || dotIdx > partAbsStart + partText.length) return false;
  const terms = splitTopLevelAndRaw(partText);
  if (terms.length === 0) return false;
  return terms.some((term) => {
    let tAbsStart = partAbsStart + term.start;
    let tAbsEnd = tAbsStart + term.text.length;
    if (dotIdx < tAbsStart || dotIdx > tAbsEnd) return false;
    // normalize harmless grouping parens around the whole term
    const peeled = peelOuterParens(sanitized, tAbsStart, tAbsEnd);
    tAbsStart = peeled.start;
    tAbsEnd = peeled.end;
    if (dotIdx < tAbsStart || dotIdx > tAbsEnd) return false;
    const t = sanitized.slice(tAbsStart, tAbsEnd).trim();
    if (t.length === 0) return false;
    if (t.includes('||') || t.includes('?')) return false;
    if (countCallMembers(t) !== 1) return false;
    if (receiverUsageAt(sanitized, dotIdx) !== 'plain') return false;
    const callEnd = callExprEndAt(sanitized, dotIdx);
    if (callEnd === -1) return false;
    let prefix = sanitized.slice(tAbsStart, receiverStartAt(sanitized, dotIdx)).trim();
    let tail = sanitized.slice(callEnd, tAbsEnd).trim();
    // mirror-strip grouping pairs: `((a.send(1)), "message")` — the wrapper
    // `)`(s) after the call pair with the `(`(s) before the receiver
    while (prefix.endsWith('(') && tail.startsWith(')')) {
      prefix = prefix.slice(0, -1).trimEnd();
      tail = tail.slice(1).trimStart();
    }
    if (tail.length === 0 || tail.startsWith(',')) return true;
    if (tail.startsWith('==') || tail.startsWith('!=')) {
      const cmp = tail.match(/^(==|!=)/)?.[0] ?? '';
      const target = tail.slice(cmp.length).trim();
      if (
        (cmp === '==' && target.startsWith('true')) ||
        (cmp === '!=' && target.startsWith('false'))
      ) {
        return true;
      }
      return false;
    }
    return false;
  });
}

interface GuardInfo {
  halting: boolean;
}

/**
 * If the call sits inside the condition of a `require`/`assert`/`if`, return
 * whether that guard actually halts when the call FAILS.
 * - require/assert revert unless their condition holds: they validate the call
 *   only when the condition implies the call result is true (every top-level
 *   `||`-disjunct must contain an `&&`-term that positively requires this
 *   call). `require(a.call || x)`, `require(!a.call)`,
 *   `require(a.call ? true : x)` do not validate the call.
 * - `if` validates only when the failing path halts: a disjunct that is purely
 *   `!<call>` runs the then-branch on failure (it must halt); otherwise the
 *   else branch must halt AND the condition must imply the call result
 *   (`if (a.call || x) work(); else revert();` does NOT validate the call).
 */
function enclosingGuard(sanitized: string, idx: number): GuardInfo | null {
  const re = /\b(require|assert|if)\s*\(/g;
  let best: { kw: string; condClose: number; condOpen: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sanitized.slice(0, idx + 1))) !== null) {
    const open = m.index + m[0].length - 1;
    const close = findMatching(sanitized, open, '(', ')');
    if (close !== -1 && close > idx) {
      best = { kw: m[1] as string, condClose: close, condOpen: open };
    }
  }
  if (!best) return null;
  const condStart = best.condOpen + 1;
  const condText = sanitized.slice(condStart, best.condClose);
  const rawParts = splitTopLevelOrRaw(condText);
  const body = parseIfBody(sanitized, best.condClose);

  if (best.kw !== 'if') {
    return {
      halting: rawParts.every((p) => partRequiresCall(sanitized, p.text, condStart + p.start, idx)),
    };
  }

  const pureNegated = rawParts.some(
    (p) =>
      partIsPureNegatedCall(
        sanitized,
        condStart + p.start,
        condStart + p.start + p.text.length,
        idx,
      ) ||
      partIsFailureComparison(
        sanitized,
        condStart + p.start,
        condStart + p.start + p.text.length,
        idx,
      ),
  );
  if (pureNegated) return { halting: body.thenHalts };
  return {
    halting:
      body.hasElse &&
      body.elseHalts &&
      rawParts.every((p) => partRequiresCall(sanitized, p.text, condStart + p.start, idx)),
  };
}

// ---------------------------------------------------------------------------
// Capture & guard recognition
// ---------------------------------------------------------------------------

interface CaptureInfo {
  varName: string;
  /** Index of the `=` that assigns the captured variable. */
  eqIdx: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * If the call is (part of) the right-hand side of an assignment, return the
 * variable that receives the call's boolean return value. Understands:
 *   (bool success, ) = x.call(...)        typed tuple (any element count)
 *   (success, ) = x.call(...)             plain tuple (pre-declared vars)
 *   bool sent = x.send(...)               typed single variable
 *   sent = x.send(...)                    plain single variable (incl. re-assignment)
 */
function findCapture(sanitized: string, stmtStart: number, callIdx: number): CaptureInfo | null {
  // last plain '=' before the call, skipping ==, !=, <=, >=, =>, :=
  let eq = -1;
  for (let i = callIdx - 1; i >= stmtStart; i--) {
    const c = sanitized[i] as string;
    if (c !== '=') continue;
    const prev = i > 0 ? (sanitized[i - 1] as string) : '';
    const nextChar = i + 1 < sanitized.length ? (sanitized[i + 1] as string) : '';
    if (prev === '=' || prev === '!' || prev === '<' || prev === '>' || nextChar === '=') {
      continue;
    }
    eq = i;
    break;
  }
  if (eq === -1) return null;

  // The capture is only meaningful when the call expression IS the right-hand
  // side (optionally wrapped in plain parentheses). `bool ok = !a.send(1)` or
  // `bool ok = a.send(1) || allowFailure` store a TRANSFORMED result: a later
  // `require(ok)` validates the transformation, not the call, so those are not
  // captures (the call is reported as standalone instead).
  const recvStart = receiverStartAt(sanitized, callIdx);
  const callEnd = callExprEndAt(sanitized, callIdx);
  if (callEnd === -1) return null;
  const prefix = sanitized.slice(eq + 1, recvStart);
  if (!/^[\s(]*$/.test(prefix)) return null;
  const opens = prefix.split('(').length - 1;
  let closes = 0;
  let p = callEnd;
  while (p < sanitized.length && /\s/.test(sanitized[p] as string)) p += 1;
  while (p < sanitized.length && sanitized[p] === ')') {
    closes += 1;
    p += 1;
  }
  while (p < sanitized.length && /\s/.test(sanitized[p] as string)) p += 1;
  if (closes !== opens) return null;
  if (p < sanitized.length && !/[\s;{}]/.test(sanitized[p] as string)) return null;

  const head = sanitized.slice(stmtStart, eq).replace(/\s+$/, '');
  const tupleTyped = head.match(/\(\s*bool\s+([A-Za-z_$][\w$]*)[^()]*\)$/);
  if (tupleTyped) return { varName: tupleTyped[1] as string, eqIdx: eq };
  const tuplePlain = head.match(/\(\s*([A-Za-z_$][\w$]*)\s*,[^()]*\)$/);
  if (tuplePlain) return { varName: tuplePlain[1] as string, eqIdx: eq };
  const singleTyped = head.match(/bool\s+([A-Za-z_$][\w$]*)$/);
  if (singleTyped) return { varName: singleTyped[1] as string, eqIdx: eq };
  const singlePlain = head.match(/([A-Za-z_$][\w$]*)$/);
  if (singlePlain) return { varName: singlePlain[1] as string, eqIdx: eq };
  return null;
}

/**
 * Start index of the statement containing `idx`: the position after the
 * previous top-level `;`, `{` or `}`. Parenthesis/bracket opens are never
 * statement boundaries (an RHS may be parenthesised: `ok = (a.send(1));`).
 */
function statementStart(sanitized: string, idx: number): number {
  let depth = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const c = sanitized[i] as string;
    if (c === ')' || c === ']') {
      depth += 1;
    } else if (c === '(' || c === '[') {
      if (depth > 0) depth -= 1;
    } else if (c === '}' || c === '{') {
      if (depth === 0) return i + 1;
    } else if (c === ';' && depth === 0) {
      return i + 1;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Event model
// ---------------------------------------------------------------------------

interface CaptureEvent {
  idx: number;
  eqIdx: number;
  line: number;
  regionId: number | null;
  kind: LowLevelCallKind;
  varName: string;
  lineText: string;
}

interface ClobberEvent {
  idx: number;
  regionId: number | null;
  varNames: string[];
}

interface GuardEvent {
  idx: number;
  regionId: number | null;
  varNames: string[];
}

/**
 * True when the guard statement is nested inside conditional control flow, so
 * it may never execute after a capture: inside an `if`/`else`/`loop`/`catch`
 * brace block, or in a brace-less conditional body (`if (x) require(ok);`,
 * `else require(ok);`). Unconditional blocks (`unchecked { ... }`, bare
 * `{ ... }`, `try { ... }` bodies) do not count. Guards that ARE the leading
 * conditional of their own statement are not nested.
 */
const CONDITIONAL_BLOCK_WORDS = new Set(['if', 'else', 'for', 'while', 'do', 'catch', 'try']);
const LOOP_BLOCK_WORDS = new Set(['for', 'while', 'do']);

/**
 * Backward scan over the construct header that owns the brace block opening
 * at `openIdx`: returns the header keyword (`if`, `else`, `for`, `while`,
 * `do`, `catch`, `try`, `unchecked`, ...) or '' when the block is a bare
 * `{ ... }` / function body. Jumps balanced paren groups; the scan ends at a
 * `;`, `{` or `}` (so headers never bleed into earlier statements).
 */
function blockHeaderKeyword(sanitized: string, floor: number, openIdx: number): string {
  let k = openIdx - 1;
  while (k >= floor) {
    const c = sanitized[k] as string;
    if (/\s/.test(c)) {
      k -= 1;
      continue;
    }
    if (c === ')' || c === ']') {
      const close = c;
      const open = c === ')' ? '(' : '[';
      let p = 0;
      let found = false;
      for (let j = k; j >= floor; j--) {
        const cc = sanitized[j] as string;
        if (cc === close) p += 1;
        else if (cc === open) {
          p -= 1;
          if (p === 0) {
            k = j - 1;
            found = true;
            break;
          }
        }
      }
      if (!found) return '';
      continue;
    }
    if (/[\w$]/.test(c)) {
      let start = k;
      while (start >= floor && /[\w$]/.test(sanitized[start] as string)) start -= 1;
      const word = sanitized.slice(start + 1, k + 1);
      // only control-flow keywords decide the block's nature; plain
      // identifiers (receivers, `try e() {`, fn names) are skipped so the
      // scan keeps going until a `;`/`{`/`}` or a real keyword
      if (CONDITIONAL_BLOCK_WORDS.has(word) || LOOP_BLOCK_WORDS.has(word)) return word;
      k = start;
      continue;
    }
    if (c === ';' || c === '{' || c === '}') return '';
    k -= 1;
  }
  return '';
}

/**
 * A control-flow brace block: the span of an `if`/`else`/loop/`do`/`catch`/
 * `try` body together with whether it is a loop (`for`/`while`/`do`).
 */
interface ControlBlock {
  open: number;
  close: number;
  isLoop: boolean;
}

/**
 * Collect every braced control-flow body in the source. Blocks that are
 * unconditional (`unchecked { }`, `assembly { }`, bare `{ }`, function
 * bodies) are not included — they cannot skip execution.
 */
function collectControlBlocks(sanitized: string): ControlBlock[] {
  const blocks: ControlBlock[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    if (sanitized[i] !== '{') continue;
    const word = blockHeaderKeyword(sanitized, 0, i);
    if (!CONDITIONAL_BLOCK_WORDS.has(word) && !LOOP_BLOCK_WORDS.has(word)) continue;
    const close = findMatching(sanitized, i, '{', '}');
    if (close === -1) continue;
    blocks.push({ open: i, close, isLoop: LOOP_BLOCK_WORDS.has(word) });
  }
  return blocks;
}

/**
 * Execution context of an event at `idx`: the control-flow bodies that
 * enclose it. Braced bodies contribute `b:<open>`; a brace-less conditional
 * body (`if (x) stmt;`, `else stmt;`, `do stmt; while (..);`,
 * `for (..) stmt;`) contributes `c:<segStart>[:...]` which pins the marker to
 * that exact statement (a brace-less body is a single statement).
 */
function eventContext(sanitized: string, blocks: ControlBlock[], idx: number): string[] {
  const ctx: string[] = [];
  for (const b of blocks) {
    if (b.open < idx && idx < b.close) ctx.push(`b:${b.open}`);
  }
  const segStart = statementStart(sanitized, idx);
  const seg = sanitized.slice(segStart, idx);
  const headerRe = /\b(if|else|for|while|do)\b/g;
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(seg)) !== null) {
    const word = hm[1] as string;
    const after = seg.slice(hm[0].length).trimStart();
    if (word === 'do') {
      if (!after.startsWith('{')) ctx.push(`c:${segStart}:do:loop`);
      continue;
    }
    if (word === 'else') {
      if (!after.startsWith('{')) ctx.push(`c:${segStart}:else`);
      continue;
    }
    // if/for/while: header parens must close before the event
    const open = segStart + hm.index + hm[0].length - 1;
    const close = findMatching(sanitized, open, '(', ')');
    if (close === -1 || close >= idx) continue;
    // a brace right after the header means the body is braced and is already
    // represented by the block spans
    const rest = sanitized.slice(close + 1, idx);
    if (!rest.includes('{')) {
      ctx.push(word === 'if' ? `c:${segStart}:${close}` : `c:${segStart}:${close}:loop`);
    }
  }
  return ctx;
}

/**
 * Innermost enclosing loop of `idx` (span open index), or -1 when `idx` is
 * not inside a loop.
 */
function innermostLoopOf(blocks: ControlBlock[], idx: number): number {
  let innermost = -1;
  for (const b of blocks) {
    if (b.isLoop && b.open < idx && idx < b.close) innermost = b.open;
  }
  return innermost;
}

/**
 * A `break`/`continue` between the capture and the guard that targets the
 * same loop as the capture can skip the guard on some iteration while a
 * failed call is still pending (round-10 overwrite/skip bug). Breaks that
 * belong to deeper nested loops do not skip the outer guard.
 */
function hasLoopExitBarrier(
  sanitized: string,
  blocks: ControlBlock[],
  captureIdx: number,
  guardIdx: number,
): boolean {
  if (guardIdx <= captureIdx + 1) return false;
  const captureLoop = innermostLoopOf(blocks, captureIdx);
  if (captureLoop === -1) return false;
  const barrierRe = /\b(break|continue)\b/g;
  let bm: RegExpExecArray | null;
  while ((bm = barrierRe.exec(sanitized)) !== null) {
    if (bm.index <= captureIdx || bm.index >= guardIdx) continue;
    if (innermostLoopOf(blocks, bm.index) === captureLoop) return true;
  }
  return false;
}

/**
 * Guard/capture pairing rule. A guard may validate a capture only when:
 *  - every control-flow body enclosing the guard also encloses the capture
 *    (the guard can only run on paths the capture already took), and
 *  - every braced LOOP enclosing the capture also encloses the guard (a
 *    guard after a loop sees only the final iteration's result, silently
 *    dropping earlier failures — the round-9 overwrite bug), and
 *  - the capture is not inside a brace-less loop body (`for (..) x = c();`
 *    — no guard can be per-iteration there since the body is one statement),
 *    and
 *  - no conditional `break`/`continue` targeting the capture's loop appears
 *    between capture and guard (round-10 skip bug).
 */
function guardCanValidate(
  sanitized: string,
  guardCtx: string[],
  captureCtx: string[],
  blocks: ControlBlock[],
  captureIdx: number,
  guardIdx: number,
): boolean {
  for (const g of guardCtx) {
    if (!captureCtx.includes(g)) return false;
  }
  for (const b of blocks) {
    if (b.isLoop && b.open < captureIdx && captureIdx < b.close) {
      if (!guardCtx.includes(`b:${b.open}`)) return false;
    }
  }
  for (const c of captureCtx) {
    if (c.endsWith(':loop')) return false;
  }
  return !hasLoopExitBarrier(sanitized, blocks, captureIdx, guardIdx);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const source = context.sourceCode;
    if (!source) return findings;

    const sanitized = sanitizeSource(source);
    const lineStarts = buildLineStarts(source);
    const lines = source.split('\n');
    const regions = buildRegions(sanitized);
    const controlBlocks = collectControlBlocks(sanitized);

    // --- locate low-level member calls -------------------------------------
    const captureEvents: CaptureEvent[] = [];
    const standaloneFindings: FindingResult[] = [];

    for (const call of scanCallTokens(sanitized)) {
      const { dotIdx, kind } = call;

      // the receiver must be an identifier / `)` / `]` (whitespace tolerant):
      // a bare `.call(` or a dot belonging to a longer identifier does not match
      let back = dotIdx - 1;
      while (back >= 0 && /\s/.test(sanitized[back] as string)) back -= 1;
      if (back < 0 || !/[\w$)\]]/.test(sanitized[back] as string)) continue;

      // inline guard (require/assert/if containing the call)?
      const guard = enclosingGuard(sanitized, dotIdx);
      if (guard?.halting) continue; // return value enforced inline -> safe

      // captured into a variable?
      const stmtStart = statementStart(sanitized, dotIdx);
      const capture = findCapture(sanitized, stmtStart, dotIdx);

      if (capture) {
        const region = regionAt(regions, dotIdx);
        captureEvents.push({
          idx: dotIdx,
          eqIdx: capture.eqIdx,
          line: lineOf(lineStarts, dotIdx),
          regionId: region ? region.id : null,
          kind,
          varName: capture.varName,
          lineText: (lines[lineOf(lineStarts, dotIdx) - 1] ?? '').trim(),
        });
      } else {
        const line = lineOf(lineStarts, dotIdx);
        standaloneFindings.push(
          this.createFinding(context, line, kind, undefined, (lines[line - 1] ?? '').trim()),
        );
      }
    }

    // --- locate guards that would validate captured variables ---------------
    const capturedNames = Array.from(new Set(captureEvents.map((e) => e.varName)));
    const varRegexCache = new Map<string, RegExp>();
    const wordMatch = (text: string, name: string): boolean => {
      let re = varRegexCache.get(name);
      if (!re) {
        re = new RegExp(`\\b${escapeRegExp(name)}\\b`);
        varRegexCache.set(name, re);
      }
      return re.test(text);
    };

    const guardEvents: GuardEvent[] = [];
    const guardRe = /\b(require|assert|if)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = guardRe.exec(sanitized)) !== null) {
      const open = m.index + m[0].length - 1;
      const condClose = findMatching(sanitized, open, '(', ')');
      if (condClose === -1) continue;
      const kw = m[1] as string;
      const condText = sanitized.slice(open + 1, condClose);
      const mentioned = capturedNames.filter((name) => wordMatch(condText, name));
      if (mentioned.length === 0) continue;
      const validNames = mentioned.filter((name) =>
        kw === 'if'
          ? ifGuardValid(sanitized, condText, condClose, name)
          : requireGuardValid(condText, name),
      );
      if (validNames.length === 0) continue;
      const region = regionAt(regions, m.index);
      guardEvents.push({
        idx: m.index,
        regionId: region ? region.id : null,
        varNames: validNames,
      });
    }

    // assignments (plain or compound) overwrite a pending capture before read
    const captureEqs = new Set(captureEvents.map((e) => e.eqIdx));
    const clobberEvents: ClobberEvent[] = [];
    const recordClobber = (eqIdx: number, names: string[]): void => {
      if (captureEqs.has(eqIdx) || names.length === 0) return; // a call capture
      const region = regionAt(regions, eqIdx);
      clobberEvents.push({ idx: eqIdx, regionId: region ? region.id : null, varNames: names });
    };

    const assignRe =
      /(?<![\w$.)=!<>:])([A-Za-z_$][\w$]*)\s*(?:\|=|&=|\^=|\+=|-=|\*=|%=|<<=|>>=|\/=|=(?!=))/g;
    while ((m = assignRe.exec(sanitized)) !== null) {
      // `s.ok = ...` / `s . ok = ...` writes a struct member, not the local
      let pre = m.index - 1;
      while (pre >= 0 && /\s/.test(sanitized[pre] as string)) pre -= 1;
      if (pre >= 0 && sanitized[pre] === '.') continue;
      const eqIdx = m.index + m[0].length - 1;
      recordClobber(eqIdx, [m[1] as string]);
    }

    // tuple assignments: (a, b) = f(); — every listed variable is overwritten
    const tupleRe = /\(([^()]*)\)\s*=(?!=)/g;
    while ((m = tupleRe.exec(sanitized)) !== null) {
      const eqIdx = m.index + m[0].length - 1;
      const inner = m[1] as string;
      const names = inner
        .split(',')
        .map((part) => {
          const partText = part.trim();
          // standalone variable names only — `s.ok` / `(x).ok` are member lhs
          const match = partText.match(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*$/);
          return match?.[1] ?? '';
        })
        .filter((name) => name.length > 0 && name !== 'memory' && name !== 'calldata');
      recordClobber(eqIdx, names);
    }

    // --- per-region LIFO stacks: a guard validates the most recent capture ----
    const stacks = new Map<string, Map<string, CaptureEvent[]>>();
    const pushCapture = (e: CaptureEvent): void => {
      const key = String(e.regionId);
      let byName = stacks.get(key);
      if (!byName) {
        byName = new Map();
        stacks.set(key, byName);
      }
      const list = byName.get(e.varName) ?? [];
      list.push(e);
      byName.set(e.varName, list);
    };
    const guardCtxMemo = new Map<number, string[]>();
    const contextOf = (idx: number): string[] => {
      let ctx = guardCtxMemo.get(idx);
      if (!ctx) {
        ctx = eventContext(sanitized, controlBlocks, idx);
        guardCtxMemo.set(idx, ctx);
      }
      return ctx;
    };
    /**
     * Pop the most recent pending capture of `varName`. A guard pop is only
     * allowed when the guard's control-flow context can actually validate
     * that capture (see guardCanValidate); `guardCtx === null` is the clobber
     * case, which always pops the top capture.
     */
    const popCapture = (
      regionId: number | null,
      varName: string,
      guardCtx: string[] | null,
      guardIdx: number | null,
    ): CaptureEvent | undefined => {
      const byName = stacks.get(String(regionId));
      const list = byName?.get(varName);
      if (!list || list.length === 0) return undefined;
      if (guardCtx === null) return list.pop() as CaptureEvent;
      const top = list[list.length - 1] as CaptureEvent;
      if (
        !guardCanValidate(
          sanitized,
          guardCtx,
          contextOf(top.idx),
          controlBlocks,
          top.idx,
          guardIdx ?? top.idx,
        )
      ) {
        return undefined;
      }
      return list.pop() as CaptureEvent;
    };

    const events: Array<{ idx: number; kind: 'capture' | 'guard' | 'clobber' }> = [
      ...captureEvents.map((e) => ({ idx: e.idx, kind: 'capture' as const })),
      ...guardEvents.map((g) => ({ idx: g.idx, kind: 'guard' as const })),
      ...clobberEvents.map((c) => ({ idx: c.idx, kind: 'clobber' as const })),
    ];
    events.sort((a, b) => a.idx - b.idx);

    for (const event of events) {
      if (event.kind === 'capture') {
        const e = captureEvents.find((c) => c.idx === event.idx);
        if (e) pushCapture(e);
      } else if (event.kind === 'clobber') {
        const c = clobberEvents.find((ce) => ce.idx === event.idx);
        if (c) {
          for (const name of c.varNames) {
            const overwritten = popCapture(c.regionId, name, null, null);
            if (overwritten) {
              // the call result was overwritten before any guard could read it
              findings.push(
                this.createFinding(
                  context,
                  overwritten.line,
                  overwritten.kind,
                  overwritten.varName,
                  overwritten.lineText,
                ),
              );
            }
          }
        }
      } else {
        const g = guardEvents.find((ge) => ge.idx === event.idx);
        if (g) {
          const guardCtx = contextOf(g.idx);
          for (const name of g.varNames) popCapture(g.regionId, name, guardCtx, g.idx);
        }
      }
    }

    // --- unresolved captures are findings ------------------------------------
    const reported = new Set<CaptureEvent>();
    for (const byName of stacks.values()) {
      for (const list of byName.values()) {
        for (const e of list) {
          if (!reported.has(e)) {
            reported.add(e);
            findings.push(this.createFinding(context, e.line, e.kind, e.varName, e.lineText));
          }
        }
      }
    }

    findings.push(...standaloneFindings);
    findings.sort((a, b) => a.lineStart - b.lineStart);
    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the unchecked return value at ${finding.filePath}:${finding.lineStart}:

1. Capture the boolean returned by the low-level call.
2. Validate it with \`require(success)\` (or an equivalent halting check) before proceeding.

Example fix:
\`\`\`solidity
function withdraw(uint256 amount) public {
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
\`\`\`

Note: \`address.transfer()\` reverts on failure by itself and is not affected by this rule.`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }

  private createFinding(
    context: AnalysisContext,
    lineNumber: number,
    kind: LowLevelCallKind,
    varName?: string,
    snippet?: string,
  ): FindingResult {
    const description = varName
      ? `Low-level \`.${kind}()\` return value is captured in \`${varName}\` but never checked within the same function. If the call fails, execution continues silently.`
      : `Low-level \`.${kind}()\` is performed without checking its boolean return value. If the call fails, execution continues silently.`;

    return {
      pluginId: this.metadata.id,
      title: 'Unchecked Low-Level Call Return Value',
      description,
      severity: this.metadata.severity,
      filePath: `${context.contractName}.sol`,
      lineStart: lineNumber,
      lineEnd: lineNumber,
      codeSnippet: snippet ?? '',
      recommendation:
        'Capture the boolean returned by the call and enforce it with require(success) (or assert / revert on failure) before continuing.',
      confidence: 0.9,
      references: this.metadata.references ?? [],
    };
  }
}
