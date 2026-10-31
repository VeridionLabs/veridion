import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'timestamp',
  name: 'Timestamp Dependence Detector',
  version: '1.0.0',
  description:
    'Detects reliance on block.timestamp (and the legacy now alias) inside conditional logic, where the value can be nudged by block producers and must not drive critical decisions.',
  severity: FindingSeverity.LOW,
  category: 'TIMESTAMP',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['timestamp', 'block.timestamp', 'now', 'swc-116', 'time-manipulation'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-116',
    'https://consensys.github.io/smart-contract-best-practices/attacks/timestamp-dependence/',
  ],
};

/** Matches `block.timestamp`, tolerating whitespace around the member access. */
const TIMESTAMP_PATTERN = /\bblock\s*\.\s*timestamp\b/g;

/** Matches the legacy `now` keyword alias (removed in Solidity 0.7.0). */
const NOW_PATTERN = /\bnow\b/g;

/** True when the given column of a line sits inside a string literal. */
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

interface SourceScan {
  /** Source with comment characters and string contents blanked out, same length. */
  code: string;
  /** Per-line comment maps, aligned with the source lines. */
  comments: LineCommentScan[];
  /** Character offset at which each line starts. */
  lineOffsets: number[];
  lines: string[];
}

/**
 * Produces a position-preserving view of the source where comments and string
 * literal contents are replaced by spaces, so pattern matching cannot hit them
 * while reported offsets still line up with the original text.
 */
function scanSource(source: string): SourceScan {
  const lines = source.split('\n');
  const comments: LineCommentScan[] = [];
  const lineOffsets: number[] = [];
  const maskedLines: string[] = [];
  let inBlock = false;
  let offset = 0;

  for (const line of lines) {
    const scan = scanLineForComments(line, inBlock);
    comments.push(scan);
    lineOffsets.push(offset);
    inBlock = scan.inBlockAfter;
    offset += line.length + 1;

    const chars = maskStrings(line).split('');
    for (let i = 0; i < chars.length; i++) {
      if (scan.commented[i] === true) chars[i] = ' ';
    }
    maskedLines.push(chars.join(''));
  }

  return { code: maskedLines.join('\n'), comments, lineOffsets, lines };
}

interface Span {
  start: number;
  end: number;
}

/**
 * Collects the character ranges occupied by the condition of every
 * `if`/`require`/`assert`/`while`/`for` statement, by matching parentheses.
 */
function findConditionSpans(code: string): Span[] {
  const spans: Span[] = [];
  const opener = /\b(?:if|require|assert|while|for)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(code)) !== null) {
    const open = code.indexOf('(', match.index);
    if (open === -1) continue;

    let depth = 0;
    for (let i = open; i < code.length; i++) {
      const ch = code[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          spans.push({ start: open, end: i });
          break;
        }
      }
    }
  }

  return spans;
}

/** True when the offset falls inside a ternary `? :` expression of its statement. */
function isInsideTernary(code: string, offset: number): boolean {
  let start = offset;
  while (start > 0 && !/[;{}]/.test(code[start - 1] ?? ';')) start -= 1;
  let end = offset;
  while (end < code.length && !/[;{}]/.test(code[end] ?? ';')) end += 1;

  const statement = code.slice(start, end);
  const question = statement.indexOf('?');
  if (question === -1) return false;

  return statement.indexOf(':', question) !== -1;
}

interface TimestampMatch {
  kind: 'block.timestamp' | 'now';
  offset: number;
  lineIndex: number;
  line: number;
  conditional: boolean;
}

export class TimestampPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // No initialization needed
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const scan = scanSource(context.sourceCode);
    const spans = findConditionSpans(scan.code);
    const findings: FindingResult[] = [];
    const seen = new Set<string>();

    const matches: TimestampMatch[] = [];
    for (const match of scan.code.matchAll(TIMESTAMP_PATTERN)) {
      matches.push(...this.describe('block.timestamp', match.index ?? 0, scan, spans));
    }
    for (const match of scan.code.matchAll(NOW_PATTERN)) {
      matches.push(...this.describe('now', match.index ?? 0, scan, spans));
    }

    for (const match of matches) {
      // `block.timestamp` is only dangerous when it drives a decision. The legacy
      // `now` alias is reported wherever it appears, since it no longer compiles
      // on modern compilers and signals stale time handling.
      if (match.kind === 'block.timestamp' && !match.conditional) continue;

      const key = `${match.kind}:${match.line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        pluginId: this.metadata.id,
        title: match.conditional
          ? `Timestamp Dependence via ${match.kind}`
          : `Deprecated ${match.kind} Alias Usage`,
        description: match.conditional
          ? `The condition on this line depends on ${match.kind}, which the block producer controls within a small tolerance. Using it for time-critical decisions (deadlines, auctions, randomisation, rate limits) allows the value to be nudged in the producer's favour.`
          : `This line uses the legacy ${match.kind} alias for block.timestamp. It was removed in Solidity 0.7.0 and signals time handling that may need review.`,
        severity: FindingSeverity.LOW,
        filePath: `${context.contractName}.sol`,
        lineStart: match.line,
        lineEnd: match.line,
        codeSnippet: (scan.lines[match.lineIndex] ?? '').trim().slice(0, 200),
        recommendation: this.buildRecommendation(match.kind, match.conditional),
        confidence: match.conditional ? 0.85 : 0.9,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To address the timestamp dependence at ${finding.filePath}:${finding.lineStart}:

1. Keep block.timestamp out of decisions where a producer could profit from a
   small shift. Prefer a value the protocol already committed to:

\`\`\`solidity
// Instead of: require(block.timestamp >= deadline)
require(committedDeadline >= block.timestamp, "Too late");
\`\`\`

2. Acceptable uses are coarse-grained ones where a ~15 second tolerance is
   irrelevant, for example a 30 day vesting cliff:

\`\`\`solidity
uint256 constant VESTING_PERIOD = 30 days;
require(block.timestamp >= start + VESTING_PERIOD, "Still vesting");
\`\`\`

3. Never derive randomness or lottery outcomes from timestamps. Use a commit
   reveal scheme or a verifiable randomness source instead.

4. Replace the legacy \`now\` alias with \`block.timestamp\` so the code compiles
   on Solidity 0.7.0 and later.`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }

  private describe(
    kind: 'block.timestamp' | 'now',
    offset: number,
    scan: SourceScan,
    spans: Span[],
  ): TimestampMatch[] {
    let lineIndex = 0;
    for (let i = 0; i < scan.lineOffsets.length; i++) {
      const next = scan.lineOffsets[i + 1];
      if (next === undefined || offset < next) {
        lineIndex = i;
        break;
      }
    }

    const conditional =
      spans.some((span) => offset > span.start && offset < span.end) ||
      isInsideTernary(scan.code, offset);

    return [{ kind, offset, lineIndex, line: lineIndex + 1, conditional }];
  }

  private buildRecommendation(kind: string, conditional: boolean): string {
    if (!conditional) {
      return `Replace the legacy \`${kind}\` alias with \`block.timestamp\`.`;
    }
    return [
      `Avoid letting \`${kind}\` drive the condition: capture the value into a local variable and compare against a protocol-controlled deadline, or widen the tolerance so a block producer cannot gain from shifting it.`,
      'Timestamps are acceptable for coarse-grained checks (hours to days) but never for randomness, auctions, or exact-expiry logic.',
    ].join(' ');
  }
}
