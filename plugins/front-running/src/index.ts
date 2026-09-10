import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

export class FrontRunningPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata = {
    id: 'front-running',
    name: 'Front-Running Vulnerability Scanner',
    version: '0.1.0',
    description:
      'Detects transaction ordering dependency and priority gas auction vulnerabilities in smart contracts.',
    severity: FindingSeverity.HIGH,
    category: 'FRONT_RUNNING',
    chains: ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism', 'stellar'],
    languages: ['solidity', 'vyper', 'rust'],
    tags: ['security', 'front-running', 'mev', 'gas-auction'],
    author: 'Veridion Team',
  };

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // Initialization logic if any
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const { sourceCode } = context;
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Detect Transaction Ordering Dependency
      if (line.includes('approve') || line.includes('transferFrom')) {
        // Basic heuristic for ERC20 approve front-running
        findings.push({
          pluginId: this.metadata.id,
          title: 'Potential Transaction Ordering Dependency',
          description:
            'The use of approve/transferFrom without mitigating front-running can lead to vulnerabilities.',
          severity: FindingSeverity.HIGH,
          filePath: context.contractName,
          lineStart: i + 1,
          lineEnd: i + 1,
          codeSnippet: line.trim(),
          recommendation:
            'Use safe versions of approve or require expected amounts (e.g. increaseAllowance).',
          confidence: 0.6,
          references: ['https://swcregistry.io/docs/SWC-114'],
        });
      }

      // Detect Priority Gas Auction (PGA) vulnerabilities
      if (line.includes('block.timestamp') || line.includes('tx.gasprice')) {
        findings.push({
          pluginId: this.metadata.id,
          title: 'Potential Priority Gas Auction Vulnerability',
          description:
            'Relying on gas price or block timestamp can make the contract susceptible to Priority Gas Auctions or miner manipulation.',
          severity: FindingSeverity.MEDIUM,
          filePath: context.contractName,
          lineStart: i + 1,
          lineEnd: i + 1,
          codeSnippet: line.trim(),
          recommendation:
            'Avoid relying heavily on gas price or block.timestamp for critical logic.',
          confidence: 0.5,
          references: [
            'https://consensys.github.io/smart-contract-best-practices/development-recommendations/solidity-specific/timestamp-dependence/',
          ],
        });
      }
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return finding.recommendation;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language.toLowerCase());
  }
}
