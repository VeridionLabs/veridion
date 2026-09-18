import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { ShortAddressPlugin } from './index';

function ctx(sourceCode: string, language = 'solidity'): AnalysisContext {
  return {
    contractName: 'Token',
    sourceCode,
    chain: 'ethereum',
    language,
    compilerVersion: null,
    metadata: {},
  };
}

describe('ShortAddressPlugin', () => {
  let plugin: ShortAddressPlugin;

  beforeEach(() => {
    plugin = new ShortAddressPlugin();
  });

  it('implements IRulePlugin metadata required by the issue', () => {
    expect(plugin.metadata.id).toBe('short-address');
    expect(plugin.metadata.category).toBe('SHORT_ADDRESS');
    expect(plugin.metadata.severity).toBe(FindingSeverity.MEDIUM);
    expect(plugin.metadata.languages).toContain('solidity');
  });

  it('initializes', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
  });

  it('supports solidity only', () => {
    expect(plugin.supportsContext(ctx('contract C {}'))).toBe(true);
    expect(plugin.supportsContext(ctx('contract C {}', 'vyper'))).toBe(false);
  });

  it('detects msg.sender packed into ABI call data', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Token {
  function pay() public {
    bytes memory payload = abi.encodePacked(msg.sender, uint256(1));
    address(this).call(payload);
  }
}`),
    );
    expect(findings.some((f) => f.title.includes('ABI-packed'))).toBe(true);
    expect(findings[0]?.severity).toBe(FindingSeverity.MEDIUM);
  });

  it('detects external functions with address plus later args and no length guard', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Token {
  function transfer(address to, uint256 amount) external {
    balances[to] += amount;
  }
  mapping(address => uint256) balances;
}`),
    );
    const hit = findings.find((f) => f.title.includes('External function'));
    expect(hit).toBeDefined();
    expect(hit?.codeSnippet).toContain('transfer');
    expect(plugin.getFixRecommendation(hit!)).toContain('msg.data.length');
  });

  it('does not flag when msg.data.length is validated', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Token {
  function transfer(address to, uint256 amount) external {
    require(msg.data.length >= 68);
    balances[to] += amount;
  }
  mapping(address => uint256) balances;
}`),
    );
    expect(findings.some((f) => f.title.includes('External function'))).toBe(false);
  });

  it('does not flag packed encoding that already has a length guard nearby', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Token {
  function pay() public {
    require(msg.data.length >= 68);
    bytes memory payload = abi.encodePacked(msg.sender, uint256(1));
    address(this).call(payload);
  }
}`),
    );
    expect(findings.some((f) => f.title.includes('ABI-packed'))).toBe(false);
  });

  it('ignores comments', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Token {
  function ok() public {
    // abi.encodePacked(msg.sender, uint256(1));
    uint256 x = 1;
  }
}`),
    );
    expect(findings).toHaveLength(0);
  });
});
