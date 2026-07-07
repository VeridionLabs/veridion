import { FindingSeverity } from '@veridion/shared';
import type { IRulePlugin, PluginMetadata, AnalysisContext, FindingResult } from '@veridion/scanner-types';

const metadata: PluginMetadata = {
  id: 'reentrancy',
  name: 'Reentrancy Attack Detector',
  version: '1.0.0',
  description: 'Detects reentrancy vulnerabilities where external calls are made before state updates (e.g., checks-effects-interactions violations).',
  severity: FindingSeverity.CRITICAL,
  category: 'REENTRANCY',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity', 'vyper'],
  tags: ['reentrancy', 'checks-effects-interactions', 'external-call', 'callback', 'race-condition'],
  author: 'Veridion',
  references: [
    'https://swcregistry.io/docs/SWC-107',
    'https://consensys.github.io/smart-contract-best-practices/attacks/reentrancy/',
  ],
};

export class ReentrancyPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    const lines = context.sourceCode.split('\n');

    // Pattern 1: .call(), .send(), .transfer() before state updates
    const callPatterns = [/\.call\s*\{/, /\.call\s*\(/, /\.send\s*\(/, /\.transfer\s*\(/];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      for (const pattern of callPatterns) {
        if (pattern.test(line)) {
          const hasStateChangeAfter = this.hasStateChangeAfter(lines, i);
          const hasReentrancyGuard = this.hasReentrancyGuard(context.sourceCode);

          if (hasStateChangeAfter && !hasReentrancyGuard) {
            findings.push({
              pluginId: this.metadata.id,
              title: 'Potential Reentrancy Vulnerability',
              description: 'External call detected before state changes. This could allow reentrancy attacks if the called contract calls back into this contract. Follow the checks-effects-interactions pattern.',
              severity: this.metadata.severity,
              filePath: `${context.contractName}.sol`,
              lineStart: i + 1,
              lineEnd: i + 1,
              codeSnippet: line.trim(),
              recommendation: 'Move all state changes before external calls, or use ReentrancyGuard/Checks-Effects-Interactions pattern.',
              confidence: hasStateChangeAfter ? 0.85 : 0.5,
              references: this.metadata.references ?? [],
            });
          }
        }
      }
    }

    // Pattern 2: receive() or fallback() with complex logic
    const fallbackMatch = context.sourceCode.match(/receive\s*\(\s*\)\s*external\s+payable\s*\{([^}]*)\}/s);
    if (fallbackMatch && (fallbackMatch[1]?.length ?? 0) > 100) {
      findings.push({
        pluginId: this.metadata.id,
        title: 'Complex Logic in receive() Function',
        description: 'The receive() function contains complex logic which could be exploited via reentrancy. Keep fallback functions minimal.',
        severity: FindingSeverity.HIGH,
        filePath: `${context.contractName}.sol`,
        lineStart: 1,
        lineEnd: 1,
        codeSnippet: fallbackMatch[0].slice(0, 200),
        recommendation: 'Minimize logic in receive() function. Only emit events or log the received amount.',
        confidence: 0.7,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `To fix the reentrancy vulnerability at ${finding.filePath}:${finding.lineStart}:

1. Apply the Checks-Effects-Interactions pattern:
   - Perform all checks (require statements)
   - Update state variables
   - Then make external calls

2. Or use OpenZeppelin's ReentrancyGuard:
   - Import from "@openzeppelin/contracts/utils/ReentrancyGuard.sol"
   - Add "nonReentrant" modifier to vulnerable functions

Example fix:
\`\`\`solidity
function withdraw(uint256 amount) public nonReentrant {
    require(balances[msg.sender] >= amount);
    balances[msg.sender] -= amount;  // State change first
    (bool success, ) = msg.sender.call{value: amount}("");  // External call last
    require(success);
}
\`\`\``;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.chains.includes(context.chain) && this.metadata.languages.includes(context.language);
  }

  private hasStateChangeAfter(lines: string[], callIndex: number): boolean {
    const stateChangePatterns = [
      /=\s*[^=]/,  // assignment
      /\+\+/,
      /--/,
      /\.push\s*\(/,
      /\.pop\s*\(/,
    ];

    for (let i = callIndex + 1; i < Math.min(callIndex + 20, lines.length); i++) {
      for (const pattern of stateChangePatterns) {
        if (pattern.test(lines[i]!)) return true;
      }
    }
    return false;
  }

  private hasReentrancyGuard(source: string): boolean {
    return /nonReentrant/.test(source) || /ReentrancyGuard/.test(source) || /_mutex/.test(source);
  }
}
