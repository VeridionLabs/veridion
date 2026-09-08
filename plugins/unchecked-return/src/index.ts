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
  tags: ['unchecked-return', 'swc-104', 'low-level-call', 'send', 'delegatecall'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/',
  ],
};

const LOW_LEVEL_CALL = /\.(call|send|delegatecall)\b\s*(?:\{[^}]*\}\s*)?\(/g;
const DIRECT_CHECK = /\b(require|assert|if|while)\s*\(|\breturn\b/;

function stripCommentsAndStrings(source: string): string {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

  return withoutComments.replace(/(["'])(?:(?=(\\?))\2[\s\S])*?\1/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
}

function findAssignment(prefix: string): { isAssigned: boolean; varName: string | null } {
  const assignIdx = prefix.lastIndexOf('=');
  if (assignIdx === -1) {
    return { isAssigned: false, varName: null };
  }

  const prev = prefix[assignIdx - 1];
  const next = prefix[assignIdx + 1];
  if (
    prev === '=' ||
    prev === '!' ||
    prev === '<' ||
    prev === '>' ||
    next === '=' ||
    next === '>'
  ) {
    return { isAssigned: false, varName: null };
  }

  const lhs = prefix.slice(0, assignIdx).trim();

  if (/^\(\s*,/.test(lhs)) {
    return { isAssigned: true, varName: null };
  }

  const tupleMatch = lhs.match(/^\(\s*(?:bool\s+)?(\w+)/);
  if (tupleMatch?.[1] && tupleMatch[1] !== '_') {
    return { isAssigned: true, varName: tupleMatch[1] };
  }

  const singleMatch = lhs.match(/(?:\bbool\s+)?(\w+)$/);
  if (singleMatch?.[1] && singleMatch[1] !== '_') {
    return { isAssigned: true, varName: singleMatch[1] };
  }

  return { isAssigned: true, varName: null };
}

function isVarCheckedLater(source: string, startIndex: number, varName: string): boolean {
  const window = source.slice(startIndex, Math.min(startIndex + 1500, source.length));
  const pattern = new RegExp(`\\b(require|assert|if)\\s*\\([^;]*\\b${varName}\\b`);
  return pattern.test(window);
}

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (!context.sourceCode || !this.supportsContext(context)) {
      return [];
    }

    const findings: FindingResult[] = [];
    const sourceCode = context.sourceCode;
    const stripped = stripCommentsAndStrings(sourceCode);
    const originalLines = sourceCode.split('\n');

    LOW_LEVEL_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = LOW_LEVEL_CALL.exec(stripped)) !== null) {
      const callType = match[1] ?? 'call';
      const matchIndex = match.index;

      const lastSemi = stripped.lastIndexOf(';', matchIndex);
      const lastOpenBrace = stripped.lastIndexOf('{', matchIndex);
      const lastCloseBrace = stripped.lastIndexOf('}', matchIndex);
      const stmtStart = Math.max(0, lastSemi + 1, lastOpenBrace + 1, lastCloseBrace + 1);

      const prefix = stripped.slice(stmtStart, matchIndex);

      if (DIRECT_CHECK.test(prefix)) {
        continue;
      }

      const assignment = findAssignment(prefix);
      if (assignment.isAssigned && assignment.varName) {
        if (isVarCheckedLater(stripped, matchIndex, assignment.varName)) {
          continue;
        }
      }

      const lineStart = sourceCode.slice(0, matchIndex).split('\n').length;
      const snippet = (originalLines[lineStart - 1] ?? match[0]).trim();

      findings.push({
        pluginId: this.metadata.id,
        title: `Unchecked Return Value from .${callType}()`,
        description:
          `The return value of low-level .${callType}() call is not checked. ` +
          'Execution continues even if the call fails, which can cause silent errors (SWC-104).',
        severity: this.metadata.severity,
        filePath: `${context.contractName}.sol`,
        lineStart,
        lineEnd: lineStart,
        codeSnippet: snippet,
        recommendation: `Check the return value using require(success): (bool success, ) = target.${callType}(""); require(success);`,
        confidence: 0.9,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return (
      `Fix unchecked return at ${finding.filePath}:${finding.lineStart}:\n\n` +
      'Check the return value with require(success):\n\n' +
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
    const languageOk = this.metadata.languages.includes(context.language);
    const chainOk = !context.chain || this.metadata.chains.includes(context.chain);
    return languageOk && chainOk;
  }
}
