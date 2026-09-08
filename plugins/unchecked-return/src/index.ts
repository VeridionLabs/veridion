import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

import { ReturnAnalysis } from './analysis';

const REFERENCES = [
  'https://swcregistry.io/docs/SWC-104/',
  'https://docs.soliditylang.org/en/latest/units-and-global-variables.html#members-of-address-types',
];

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata = {
    id: 'unchecked-return',
    name: 'Unchecked Return Value Detector',
    version: '1.0.0',
    description:
      'Detects low-level Solidity call results without a supported success check or failure-handling exit.',
    severity: FindingSeverity.HIGH,
    category: 'UNCHECKED_RETURN',
    chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism', 'base'],
    languages: ['solidity'],
    tags: ['unchecked-return', 'low-level-call', 'swc-104'],
    references: REFERENCES,
  };

  initialize(_config?: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
  }

  analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (!this.supportsContext(context)) return Promise.resolve([]);
    const analysis = new ReturnAnalysis(context.sourceCode);
    const lines = context.sourceCode.split('\n');
    const findings = analysis.run().map((call): FindingResult => {
      const start = analysis.source.tokens[call.index];
      const end = analysis.source.tokens[call.end - 1];
      const lineStart = start?.line ?? 1;
      const lineEnd = end?.endLine ?? lineStart;
      return {
        pluginId: this.metadata.id,
        title: `Unchecked .${call.method}() return value`,
        description: `The success result of .${call.method}() can reach a function exit or another loop iteration without a supported check. Failure may therefore go unnoticed. This source-level heuristic does not resolve receiver types or arbitrary helper functions.`,
        severity: this.metadata.severity,
        filePath: context.contractName.endsWith('.sol')
          ? context.contractName
          : `${context.contractName}.sol`,
        lineStart,
        lineEnd,
        codeSnippet: lines
          .slice(lineStart - 1, lineEnd)
          .join('\n')
          .trim(),
        recommendation:
          call.method === 'send'
            ? 'Capture the boolean: bool success = recipient.send(amount); require(success, "Transfer failed");'
            : `Capture the success flag: (bool success, ) = target.${call.method}(data); require(success, "Call failed");`,
        confidence: 0.7,
        references: [...REFERENCES],
      };
    });
    return Promise.resolve(findings);
  }

  getFixRecommendation(finding: FindingResult): string {
    return `At ${finding.filePath}:${finding.lineStart}, check the returned success boolean before continuing. ${finding.recommendation} Native address.transfer() already reverts on failure and has no boolean return; it is outside this rule.`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain.toLowerCase()) &&
      context.language.toLowerCase() === 'solidity'
    );
  }
}
