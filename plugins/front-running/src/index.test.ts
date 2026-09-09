import type { AnalysisContext, FindingResult } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach,describe, expect, it } from 'vitest';

import { FrontRunningPlugin } from './index';

describe('FrontRunningPlugin', () => {
  let plugin: FrontRunningPlugin;

  beforeEach(() => {
    plugin = new FrontRunningPlugin();
  });

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('front-running');
    expect(plugin.metadata.severity).toBe(FindingSeverity.HIGH);
    expect(plugin.metadata.category).toBe('FRONT_RUNNING');
  });

  it('should initialize successfully', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
  });

  it('should support solidity, vyper, rust', () => {
    const validContext = { language: 'solidity' } as AnalysisContext;
    expect(plugin.supportsContext(validContext)).toBe(true);

    const invalidContext = { language: 'python' } as AnalysisContext;
    expect(plugin.supportsContext(invalidContext)).toBe(false);
  });

  it('should return fix recommendation', () => {
    const recommendation = 'Use safe versions of approve or require expected amounts (e.g. increaseAllowance).';
    const finding = { recommendation } as unknown as FindingResult;
    expect(plugin.getFixRecommendation(finding)).toBe(recommendation);
  });

  it('should detect Transaction Ordering Dependency (approve)', async () => {
    const context: AnalysisContext = {
      contractName: 'TestContract.sol',
      sourceCode: 'function update() {\n  token.approve(address(this), 100);\n}',
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: null,
      metadata: {},
    };

    const findings = await plugin.analyze(context);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe('Potential Transaction Ordering Dependency');
    expect(findings[0]?.severity).toBe(FindingSeverity.HIGH);
    expect(findings[0]?.lineStart).toBe(2);
  });

  it('should detect Priority Gas Auction (tx.gasprice)', async () => {
    const context: AnalysisContext = {
      contractName: 'TestContract.sol',
      sourceCode: 'function checkGas() {\n  require(tx.gasprice < 100);\n}',
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: null,
      metadata: {},
    };

    const findings = await plugin.analyze(context);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe('Potential Priority Gas Auction Vulnerability');
    expect(findings[0]?.severity).toBe(FindingSeverity.MEDIUM);
    expect(findings[0]?.lineStart).toBe(2);
  });

  it('should return empty findings for safe code', async () => {
    const context: AnalysisContext = {
      contractName: 'TestContract.sol',
      sourceCode: 'function safe() {\n  uint256 x = 1 + 1;\n}',
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: null,
      metadata: {},
    };

    const findings = await plugin.analyze(context);
    expect(findings).toHaveLength(0);
  });
});
