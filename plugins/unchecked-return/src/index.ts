import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const LOW_LEVEL_CALL_PATTERN = /\.(call|send|delegatecall)\s*(?:\{[^}]*\})?\s*\(/g;
const EVM_CHAINS = ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'];
const CHECK_LOOKAHEAD_LINES = 12;

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description:
    'Detects low-level Solidity call, send, and delegatecall results that are ignored or assigned without validation.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: EVM_CHAINS,
  languages: ['solidity'],
  tags: ['unchecked-return', 'low-level-call', 'call', 'send', 'delegatecall'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-104',
    'https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/',
  ],
};

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const lines = context.sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const sourceLine = lines[i];
      if (!sourceLine) continue;

      const codeLine = stripInlineComment(sourceLine);
      LOW_LEVEL_CALL_PATTERN.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = LOW_LEVEL_CALL_PATTERN.exec(codeLine)) !== null) {
        const callKind = match[1];
        if (!callKind || isInlineChecked(codeLine, match.index)) continue;

        const checkedVariable = extractCheckedVariable(codeLine, match.index, callKind);
        if (checkedVariable && isVariableChecked(lines, i, checkedVariable)) continue;

        findings.push(createFinding(context, sourceLine, i + 1, callKind, checkedVariable));
      }
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `Handle the boolean return from the low-level call at ${finding.filePath}:${finding.lineStart}. Assign it to a variable and enforce it with require(success, "low-level call failed") or revert inside an if (!success) branch.`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}

function stripInlineComment(line: string): string {
  const commentIndex = line.indexOf('//');
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function isInlineChecked(line: string, matchIndex: number): boolean {
  const prefix = line.slice(0, matchIndex);

  return (
    /\b(?:require|assert)\s*\([^;]*$/.test(prefix) ||
    /\bif\s*\([^;]*$/.test(prefix) ||
    /\breturn\s+[^;]*$/.test(prefix)
  );
}

function extractCheckedVariable(line: string, matchIndex: number, callKind: string): string | null {
  const prefix = line.slice(0, matchIndex);

  if (callKind === 'send') {
    const boolAssignment = prefix.match(/\b(?:bool\s+)?([A-Za-z_$][\w$]*)\s*=\s*[^=]*$/);
    return boolAssignment?.[1] ?? null;
  }

  const tupleAssignment = prefix.match(/\(\s*(?:bool\s+)?([A-Za-z_$][\w$]*)\s*,/);
  return tupleAssignment?.[1] ?? null;
}

function isVariableChecked(lines: string[], startIndex: number, variableName: string): boolean {
  if (variableName === '_') return false;

  const escapedName = escapeRegExp(variableName);
  const variablePattern = new RegExp(`\\b${escapedName}\\b`);
  const positiveGuardPattern = new RegExp(
    `\\b(?:require|assert)\\s*\\(\\s*${escapedName}(?:\\s*(?:==|!=)\\s*(?:true|false))?\\b`,
  );
  const negativeGuardPattern = new RegExp(`\\bif\\s*\\(\\s*!\\s*${escapedName}\\b`);
  const branchGuardPattern = new RegExp(`\\bif\\s*\\(\\s*${escapedName}\\b`);

  for (
    let i = startIndex;
    i < Math.min(startIndex + CHECK_LOOKAHEAD_LINES, lines.length);
    i++
  ) {
    const currentLine = stripInlineComment(lines[i] ?? '');
    if (!variablePattern.test(currentLine)) continue;

    if (
      positiveGuardPattern.test(currentLine) ||
      negativeGuardPattern.test(currentLine) ||
      branchGuardPattern.test(currentLine)
    ) {
      return true;
    }
  }

  return false;
}

function createFinding(
  context: AnalysisContext,
  sourceLine: string,
  lineNumber: number,
  callKind: string,
  checkedVariable: string | null,
): FindingResult {
  const recommendation =
    checkedVariable === null
      ? 'Capture the boolean return value and require it before continuing, for example: (bool success, ) = target.call(data); require(success, "low-level call failed");'
      : `Validate ${checkedVariable} with require(${checkedVariable}, "low-level call failed") or revert when it is false.`;

  return {
    pluginId: metadata.id,
    title: `Unchecked ${callKind} Return Value`,
    description:
      `The result of a low-level Solidity ${callKind} operation is not checked. ` +
      'Ignoring this return value can let execution continue after a failed external call, leaving contract state inconsistent.',
    severity: metadata.severity,
    filePath: `${context.contractName}.sol`,
    lineStart: lineNumber,
    lineEnd: lineNumber,
    codeSnippet: sourceLine.trim(),
    recommendation,
    confidence: checkedVariable === null ? 0.9 : 0.85,
    references: metadata.references ?? [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
