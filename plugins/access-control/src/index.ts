import { FindingSeverity } from '@veridion/shared';
import type { IRulePlugin, PluginMetadata, AnalysisContext, FindingResult } from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'access-control',
  name: 'Access Control Detector',
  version: '1.0.0',
  description: 'Detects missing or insufficient access controls on sensitive functions.',
  severity: FindingSeverity.CRITICAL,
  category: 'ACCESS_CONTROL',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['access-control', 'authorization', 'ownership', 'only-owner', 'rbac'],
};

export class AccessControlPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    // Detect sensitive functions without access control modifiers
    const sensitiveFunctions = [
      { name: 'withdraw', risk: 'Funds could be drained' },
      { name: 'withdrawAll', risk: 'All funds could be drained' },
      { name: 'mint', risk: 'Unlimited token minting' },
      { name: 'burn', risk: 'Token burning by unauthorized users' },
      { name: 'pause', risk: 'Service disruption' },
      { name: 'unpause', risk: 'Uncontrolled contract reactivation' },
      { name: 'setAdmin', risk: 'Admin takeover' },
      { name: 'setOwner', risk: 'Ownership transfer' },
      { name: 'upgrade', risk: 'Unauthorized contract upgrade' },
      { name: 'initialize', risk: 'Re-initialization attack' },
      { name: 'transferOwnership', risk: 'Ownership transfer' },
      { name: 'setFee', risk: 'Fee manipulation' },
      { name: 'setPrice', risk: 'Price manipulation' },
      { name: 'setApproval', risk: 'Unauthorized approval' },
    ];

    const accessModifiers = ['onlyOwner', 'onlyAdmin', 'onlyRole', 'onlyManager', 'requireAuth', 'auth'];
    const ownablePatterns = ['Ownable', 'AccessControl', 'onlyRole', 'hasRole', 'msg.sender == owner'];

    for (const func of sensitiveFunctions) {
      const regex = new RegExp(`function\\s+${func.name}\\s*\\([^)]*\\)`, 'gi');
      const match = regex.exec(context.sourceCode);

      if (match) {
        const funcStart = context.sourceCode.lastIndexOf('function', match.index);
        const snippet = context.sourceCode.slice(funcStart, funcStart + 500);

        const hasAccessControl = accessModifiers.some((m) => snippet.includes(m)) ||
          ownablePatterns.some((p) => snippet.includes(p));

        if (!hasAccessControl) {
          findings.push({
            pluginId: this.metadata.id,
            title: `Missing Access Control on ${func.name}()`,
            description: `The ${func.name}() function lacks access control. ${func.risk}. Add proper authorization checks.`,
            severity: this.metadata.severity,
            filePath: `${context.contractName}.sol`,
            lineStart: 1,
            lineEnd: 1,
            codeSnippet: snippet.slice(0, 300),
            recommendation: `Add access control modifier to ${func.name}(). Use OpenZeppelin's Ownable or AccessControl.`,
            confidence: 0.9,
            references: ['https://docs.openzeppelin.com/contracts/5.x/access-control'],
          });
        }
      }
    }

    // Detect tx.origin usage for auth
    if (/tx\.origin\s*==/.test(context.sourceCode)) {
      findings.push({
        pluginId: this.metadata.id,
        title: 'tx.origin Used for Authorization',
        description: 'Using tx.origin for authorization is vulnerable to phishing attacks. Use msg.sender instead.',
        severity: FindingSeverity.HIGH,
        filePath: `${context.contractName}.sol`,
        lineStart: 1,
        lineEnd: 1,
        codeSnippet: context.sourceCode.match(/.{0,50}tx\.origin.{0,200}/)?.[0] ?? '',
        recommendation: 'Replace tx.origin with msg.sender for authorization checks.',
        confidence: 0.95,
        references: ['https://swcregistry.io/docs/SWC-115'],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `Fix: ${finding.recommendation}`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language);
  }
}
