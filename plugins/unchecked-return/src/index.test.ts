import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  function createContext(sourceCode: string): AnalysisContext {
    return {
      contractName: 'Vault',
      sourceCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    };
  }

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.severity).toBe('HIGH');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
    expect(plugin.metadata.languages).toContain('solidity');
  });

  it('should support solidity on EVM chains', () => {
    expect(plugin.supportsContext(createContext(''))).toBe(true);
  });

  it('should reject unsupported languages', () => {
    expect(
      plugin.supportsContext({
        ...createContext(''),
        language: 'rust',
      }),
    ).toBe(false);
  });

  it('should detect unchecked call return values', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Vault {
    function withdraw(address target, bytes memory data) external {
        target.call(data);
    }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('call');
    expect(findings[0]?.recommendation).toContain('Capture the boolean return value');
  });

  it('should detect assigned but unchecked call return values', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Vault {
    function withdraw(address target, bytes memory data) external {
        (bool success, bytes memory result) = target.call(data);
        result;
    }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.recommendation).toContain('success');
  });

  it('should detect unchecked send return values', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Vault {
    function refund(address payable target, uint256 amount) external {
        target.send(amount);
    }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('send');
  });

  it('should detect unchecked delegatecall return values', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Proxy {
    function forward(address implementation, bytes memory data) external {
        (bool ok, ) = implementation.delegatecall(data);
    }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('delegatecall');
  });

  it('should not flag call return values checked with require', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Vault {
    function withdraw(address target, bytes memory data) external {
        (bool success, ) = target.call(data);
        require(success, "low-level call failed");
    }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag send return values checked inline', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Vault {
    function refund(address payable target, uint256 amount) external {
        if (!target.send(amount)) {
            revert("refund failed");
        }
    }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag delegatecall values checked with a branch', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Proxy {
    function forward(address implementation, bytes memory data) external {
        (bool ok, ) = implementation.delegatecall(data);
        if (!ok) {
            revert("delegatecall failed");
        }
    }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should ignore comments that mention low-level calls', async () => {
    const findings = await plugin.analyze(
      createContext(`
contract Vault {
    // target.call(data);
    function ok() external {}
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should provide a fix recommendation for findings', () => {
    const recommendation = plugin.getFixRecommendation({
      pluginId: 'unchecked-return',
      title: 'Unchecked call Return Value',
      description: '',
      severity: FindingSeverity.HIGH,
      filePath: 'Vault.sol',
      lineStart: 3,
      lineEnd: 3,
      codeSnippet: 'target.call(data);',
      recommendation: '',
      confidence: 0.9,
      references: [],
    });

    expect(recommendation).toContain('require(success');
  });
});
