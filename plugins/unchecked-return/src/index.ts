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
    'Detects low-level call, send, and delegatecall sites where the boolean success value is ignored.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'swc-104', 'low-level-call', 'send', 'delegatecall'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/#handle-errors-in-external-calls',
  ],
};

const LOW_LEVEL_CALL = /\.(call|send|delegatecall)\s*(?:\{[^}]*\}\s*)?\(/g;
const CHECKED_WRAPPER = /\b(?:require|assert|if|while)\s*\(|\breturn\b/;
const DEFAULT_CONFIDENCE = 0.9;

function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
  return withoutBlocks.replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length));
}

function isAssignmentEquals(prefix: string, index: number): boolean {
  const before = index > 0 ? prefix[index - 1] : undefined;
  const after = index + 1 < prefix.length ? prefix[index + 1] : undefined;
  if (after === '=') {
    return false;
  }
  if (before === '=' || before === '!' || before === '<' || before === '>') {
    return false;
  }
  return true;
}

function hasAssignmentBefore(prefix: string): boolean {
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === '=' && isAssignmentEquals(prefix, i)) {
      return true;
    }
  }
  return false;
}

function isReturnChecked(line: string, matchIndex: number): boolean {
  const prefix = line.slice(0, matchIndex);
  return CHECKED_WRAPPER.test(prefix) || hasAssignmentBefore(prefix);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('confidence must be a finite number');
  }
  if (value < 0 || value > 1) {
    throw new RangeError('confidence must be between 0 and 1 inclusive');
  }
  return value;
}

function toLineNumber(index: number): number {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError('line index must be a non-negative safe integer');
  }
  return index + 1;
}

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  initialize(_config?: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (typeof context.sourceCode !== 'string') {
      throw new TypeError('AnalysisContext.sourceCode must be a string');
    }

    const findings: FindingResult[] = [];
    const stripped = stripComments(context.sourceCode);
    const lines = stripped.split('\n');
    const originalLines = context.sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }

      const matcher = new RegExp(LOW_LEVEL_CALL.source, LOW_LEVEL_CALL.flags);
      let match = matcher.exec(line);
      while (match !== null) {
        if (!isReturnChecked(line, match.index)) {
          const lineNumber = toLineNumber(i);
          const snippetSource = originalLines[i] ?? line;
          findings.push({
            pluginId: this.metadata.id,
            title: 'Unchecked Return Value',
            description:
              'Low-level call, send, or delegatecall return value is ignored. Execution continues if the callee reverts or returns false, which can skip later logic (SWC-104).',
            severity: this.metadata.severity,
            filePath: `${context.contractName}.sol`,
            lineStart: lineNumber,
            lineEnd: lineNumber,
            codeSnippet: snippetSource.trim(),
            recommendation:
              'Capture the boolean success value and revert on failure: (bool success, ) = addr.call(""); require(success);',
            confidence: clampConfidence(DEFAULT_CONFIDENCE),
            references: this.metadata.references ?? [],
          });
        }
        match = matcher.exec(line);
      }
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return (
      `Fix unchecked return at ${finding.filePath}:${finding.lineStart}:\n\n` +
      'Capture the success flag and revert if the call fails:\n\n' +
      '(bool success, ) = addr.call{value: amount}("");\n' +
      'require(success);\n\n' +
      'For send:\n' +
      'require(payable(addr).send(amount));'
    );
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}
