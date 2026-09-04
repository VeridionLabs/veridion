import { parse, visit } from '@solidity-parser/parser';
import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Detector',
  version: '1.0.0',
  description:
    'Detects unhandled return values from low-level calls like .call, .send, and .delegatecall.',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['unchecked-return', 'low-level-call', 'call', 'send', 'delegatecall'],
  author: 'Veridion',
  references: ['https://swcregistry.io/docs/SWC-104'],
};

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // noop
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    if (context.language !== 'solidity') {
      return findings;
    }

    try {
      const ast = parse(context.sourceCode, { loc: true });

      visit(ast, {
        FunctionCall: (node, parent) => {
          let memberAccess = null;

          if (node.expression.type === 'MemberAccess') {
            memberAccess = node.expression;
          } else if (
            node.expression.type === 'NameValueExpression' &&
            node.expression.expression.type === 'MemberAccess'
          ) {
            memberAccess = node.expression.expression;
          }

          if (memberAccess) {
            const memberName = memberAccess.memberName;
            if (['call', 'send', 'delegatecall'].includes(memberName)) {
              if (parent && this.isUnhandled(parent)) {
                findings.push({
                  pluginId: this.metadata.id,
                  title: 'Unchecked Low-Level Call Return Value',
                  description: `The return value of a low-level .${memberName}() call is not checked. This can lead to unexpected behavior if the call fails.`,
                  severity: this.metadata.severity,
                  filePath: `${context.contractName}.sol`,
                  lineStart: node.loc?.start?.line ?? 1,
                  lineEnd: node.loc?.end?.line ?? 1,
                  codeSnippet: context.sourceCode
                    .split('\n')
                    .slice((node.loc?.start?.line ?? 1) - 1, node.loc?.end?.line ?? 1)
                    .join('\n')
                    .trim(),
                  recommendation:
                    'Ensure that the return value of the low-level call is checked, usually by wrapping it in a require() statement.',
                  confidence: 0.95,
                  references: this.metadata.references ?? [],
                });
              }
            }
          }
        },
      });
    } catch (e) {
      // Ignore parse errors as it might be incomplete or invalid solidity code
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the unchecked return vulnerability at ${finding.filePath}:${finding.lineStart}:

Always check the boolean return value of low-level calls (\`call\`, \`send\`, \`delegatecall\`).

Example fix:
\`\`\`solidity
// Vulnerable:
target.call{value: amount}("");

// Safe:
(bool success, ) = target.call{value: amount}("");
require(success, "Call failed");
\`\`\``;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }

  private isUnhandled(parent: any): boolean {
    // If the parent is an ExpressionStatement, the return value is not assigned or checked.
    if (parent.type === 'ExpressionStatement') {
      return true;
    }
    // If it's used in a require, assert, if statement, variable declaration, assignment, or return, it's considered handled.
    return false;
  }
}
