import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { UpgradeProxyPlugin } from './index';

function ctx(sourceCode: string): AnalysisContext {
  return {
    contractName: 'Box',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: null,
    metadata: {},
  };
}

describe('UpgradeProxyPlugin', () => {
  let plugin: UpgradeProxyPlugin;

  beforeEach(() => {
    plugin = new UpgradeProxyPlugin();
  });

  it('has UPGRADE metadata', () => {
    expect(plugin.metadata.id).toBe('upgrade-proxy');
    expect(plugin.metadata.category).toBe('UPGRADE');
    expect(plugin.metadata.severity).toBe(FindingSeverity.HIGH);
  });

  it('detects missing _disableInitializers in constructor', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Box is Initializable {
  constructor() {}
  function initialize() public initializer {}
}`),
    );
    expect(findings.some((f) => f.title.includes('_disableInitializers'))).toBe(true);
  });

  it('detects mixed UUPS and transparent admin APIs', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Mixed {
  function upgradeTo(address impl) external {}
  function changeAdmin(address a) external {}
}`),
    );
    expect(findings.some((f) => f.title.toLowerCase().includes('uups'))).toBe(true);
  });

  it('detects storage without __gap on upgradeable implementation', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Box is UUPSUpgradeable {
  uint256 public value;
  function initialize() public initializer {}
}`),
    );
    expect(findings.some((f) => f.title.toLowerCase().includes('storage collision'))).toBe(true);
  });

  it('returns empty for a plain non-proxy contract', async () => {
    const findings = await plugin.analyze(ctx('contract Token { uint256 public total; }'));
    expect(findings).toHaveLength(0);
  });

  it('supports solidity only', () => {
    expect(plugin.supportsContext({ language: 'solidity' } as AnalysisContext)).toBe(true);
    expect(plugin.supportsContext({ language: 'go' } as AnalysisContext)).toBe(false);
  });
});
