import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.severity).toBe('HIGH');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
  });

  it('should support solidity on ethereum', () => {
    expect(
      plugin.supportsContext({
        contractName: 'Test',
        sourceCode: '',
        chain: 'ethereum',
        language: 'solidity',
        compilerVersion: null,
        metadata: {},
      }),
    ).toBe(true);
  });

  it('should not support vyper on solana', () => {
    expect(
      plugin.supportsContext({
        contractName: 'Test',
        sourceCode: '',
        chain: 'solana',
        language: 'vyper',
        compilerVersion: null,
        metadata: {},
      }),
    ).toBe(false;
  });

  it('should detect unchecked .call() return value', async () => {
    const vulnerableCode = `
contract Vulnerable {
    function sendEther(address payable recipient) public {
        recipient.call{value: 1 ether}("");
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Vulnerable',
      sourceCode: vulnerableCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.pluginId).toBe('unchecked-return');
    expect(findings[0]?.title).toContain('.call()');
  });

  it('should detect unchecked .send() return value', async () => {
    const vulnerableCode = `
contract Vulnerable {
    function sendEther(address payable recipient) public {
        recipient.send(1 ether);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Vulnerable',
      sourceCode: vulnerableCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.title).toContain('.send()');
  });

  it('should detect unchecked .delegatecall() return value', async () => {
    const vulnerableCode = `
contract Vulnerable {
    function delegate(address target) public {
        target.delegatecall(abi.encodeWithSignature("doSomething()"));
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Vulnerable',
      sourceCode: vulnerableCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.title).toContain('.delegatecall()');
  });

  it('should not flag checked return value with require', async () => {
    const safeCode = `
contract Safe {
    function sendEther(address payable recipient) public {
        (bool success, ) = recipient.call{value: 1 ether}("");
        require(success, "Call failed");
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Safe',
      sourceCode: safeCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });

  it('should not flag checked return value with if statement', async () => {
    const safeCode = `
contract Safe {
    function sendEther(address payable recipient) public {
        (bool success, ) = recipient.call{value: 1 ether}("");
        if (!success) {
            revert("Call failed");
        }
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Safe',
      sourceCode: safeCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });

  it('should provide a fix recommendation', () => {
    const recommendation = plugin.getFixRecommendation({
      pluginId: 'unchecked-return',
      title: 'Test',
      description: 'Test',
      severity: 'HIGH',
      filePath: 'test.sol',
      lineStart: 1,
      lineEnd: 1,
      codeSnippet: 'test',
      recommendation: 'test',
      confidence: 0.85,
      references: [],
    });

    expect(recommendation).toContain('require');
    expect(recommendation).toContain('bool success');
  });
});
