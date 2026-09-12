import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function has(src: string, re: RegExp): boolean {
  return re.test(src);
}

function firstLineOf(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) return 1;
  return src.slice(0, m.index).split('\n').length;
}

function snippetAt(src: string, re: RegExp): string {
  const m = re.exec(src);
  if (!m) return '';
  const line = src.split('\n')[src.slice(0, m.index).split('\n').length - 1];
  return (line || '').trim();
}

export class UpgradeProxyPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata = {
    id: 'upgrade-proxy',
    name: 'Upgrade Proxy Vulnerability Detector',
    version: '0.1.0',
    description:
      'Detects storage collisions, missing initializer locks, and UUPS vs transparent proxy mixups.',
    severity: FindingSeverity.HIGH,
    category: 'UPGRADE',
    chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
    languages: ['solidity'],
    tags: ['proxy', 'uups', 'transparent', 'initializer', 'storage-collision'],
    author: 'walterwagner',
    references: [
      'https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable',
      'https://eips.ethereum.org/EIPS/eip-1967',
    ],
  };

  async initialize(_config?: Record<string, unknown>): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const src = stripComments(context.sourceCode);
    const findings: FindingResult[] = [];
    const filePath = `${context.contractName.replace(/\.sol$/i, '')}.sol`;

    const looksUpgradeable =
      has(src, /\b(UUPSUpgradeable|TransparentUpgradeableProxy|upgradeTo|upgradeToAndCall|initializer)\b/) ||
      has(src, /delegatecall/);

    if (!looksUpgradeable) return findings;

    const usesInitializer = has(src, /\binitializer\b/);
    const hasDisable = has(src, /_disableInitializers\s*\(/);
    const hasConstructor = has(src, /\bconstructor\s*\(/);

    if (usesInitializer && hasConstructor && !hasDisable) {
      const re = /\bconstructor\s*\(/;
      findings.push({
        pluginId: this.metadata.id,
        title: 'Missing _disableInitializers() in constructor',
        description:
          'Upgradeable implementation uses initializer but the constructor does not call _disableInitializers(), so the implementation can be initialized directly.',
        severity: FindingSeverity.HIGH,
        filePath,
        lineStart: firstLineOf(src, re),
        lineEnd: firstLineOf(src, re),
        codeSnippet: snippetAt(src, re),
        recommendation:
          'Call _disableInitializers() in the implementation constructor so the logic contract cannot be taken over.',
        confidence: 0.86,
        references: this.metadata.references ?? [],
      });
    }

    const hasUpgradeTo = has(src, /\bupgradeTo(AndCall)?\s*\(/);
    const hasAdminApi = has(src, /\b(changeAdmin|admin\s*\()\b/);
    if (hasUpgradeTo && hasAdminApi) {
      const re = /\bupgradeTo(AndCall)?\s*\(/;
      findings.push({
        pluginId: this.metadata.id,
        title: 'UUPS and transparent proxy controls mixed',
        description:
          'Contract exposes both implementation upgrade functions (UUPS) and proxy admin APIs (transparent). That mix is a common misconfiguration.',
        severity: FindingSeverity.MEDIUM,
        filePath,
        lineStart: firstLineOf(src, re),
        lineEnd: firstLineOf(src, re),
        codeSnippet: snippetAt(src, re),
        recommendation:
          'Use either UUPS (upgradeTo on the implementation, no admin()) or transparent (ProxyAdmin, no upgradeTo on the logic contract), not both.',
        confidence: 0.8,
        references: this.metadata.references ?? [],
      });
    }

    const isImplementation =
      usesInitializer || has(src, /\bUUPSUpgradeable\b/) || hasUpgradeTo;
    const declaresStorage = has(src, /\b(uint256|address|mapping|bytes32|bool)\s+(public|private|internal)\s+\w+/);
    const hasGap = has(src, /__gap\b/);
    const usesErc1967Slot = has(src, /erc1967|IMPLEMENTATION_SLOT|ADMIN_SLOT/i);
    if (isImplementation && declaresStorage && !hasGap && !usesErc1967Slot) {
      const re = /\b(uint256|address|mapping|bytes32|bool)\s+(public|private|internal)\s+\w+/;
      findings.push({
        pluginId: this.metadata.id,
        title: 'Possible storage collision in upgradeable contract',
        description:
          'Upgradeable implementation declares storage without a reserved __gap (or ERC-1967 slot constants). Later upgrades can collide with inherited storage layouts.',
        severity: FindingSeverity.HIGH,
        filePath,
        lineStart: firstLineOf(src, re),
        lineEnd: firstLineOf(src, re),
        codeSnippet: snippetAt(src, re),
        recommendation:
          'Follow OpenZeppelin upgradeable storage rules: inherit storage-safe bases, append new variables, and reserve uint256[50] private __gap on contracts that others inherit.',
        confidence: 0.72,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return finding.recommendation;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language);
  }
}
