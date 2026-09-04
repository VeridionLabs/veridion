import type { AnalysisContext } from '@veridion/scanner-types';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

function ctx(
  sourceCode: string,
  extra: Partial<AnalysisContext> = {},
): AnalysisContext {
  return {
    contractName: 'Test',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.19',
    metadata: {},
    ...extra,
  };
}

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
    expect(plugin.metadata.severity).toBe('HIGH');
    expect(plugin.metadata.languages).toContain('solidity');
    expect(plugin.metadata.chains).toContain('ethereum');
  });

  it('should support solidity on ethereum', () => {
    expect(plugin.supportsContext(ctx(''))).toBe(true);
  });

  it('should not support vyper', () => {
    expect(plugin.supportsContext(ctx('', { language: 'vyper' }))).toBe(false);
  });

  it('should not support an unknown chain', () => {
    expect(plugin.supportsContext(ctx('', { chain: 'stellar' }))).toBe(false);
  });

  it('should detect unchecked address.call()', async () => {
    const findings = await plugin.analyze(
      ctx(`
pragma solidity ^0.8.0;
contract ReturnValue {
  function callnotchecked(address callee) public {
    callee.call("");
  }
}`),
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.pluginId).toBe('unchecked-return');
    expect(findings[0]?.title).toBe('Unchecked Return Value');
  });

  it('should detect unchecked call with value options', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Pay {
  function ping(address callee) public {
    callee.call{value: 1}("");
  }
}`),
    );

    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect unchecked address.send()', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SendEth {
  function ping(address payable callee) public {
    callee.send(1);
  }
}`),
    );

    expect(findings.length).toBeGreaterThan(0);
  });

  it('should detect unchecked address.delegatecall()', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Proxy {
  function ping(address callee, bytes memory data) public {
    callee.delegatecall(data);
  }
}`),
    );

    expect(findings.length).toBeGreaterThan(0);
  });

  it('should not flag require(callee.call())', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract ReturnValue {
  function callchecked(address callee) public {
    require(callee.call(""));
  }
}`),
    );

    expect(findings.length).toBe(0);
  });

  it('should not flag tuple assignment of call return', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract ReturnValue {
  function callchecked(address callee) public {
    (bool success, ) = callee.call("");
    require(success);
  }
}`),
    );

    expect(findings.length).toBe(0);
  });

  it('should return no findings for empty source', async () => {
    const findings = await plugin.analyze(ctx(''));
    expect(findings).toEqual([]);
  });

  it('should return no findings for a contract without low-level calls', async () => {
    const findings = await plugin.analyze(ctx('contract Empty {}'));
    expect(findings).toEqual([]);
  });

  it('should ignore commented-out calls', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Safe {
  function ping(address callee) public {
    // callee.call("");
  }
}`),
    );

    expect(findings.length).toBe(0);
  });

  it('should not flag address.transfer()', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Pay {
  function ping(address payable callee) public {
    callee.transfer(1);
  }
}`),
    );

    expect(findings.length).toBe(0);
  });

  it('should not flag encodeCall or callback identifiers', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Encoded {
  function ping(address callee) public {
    bytes memory data = abi.encodeCall(callee.ping, ());
    this.callback(data);
  }
  function callback(bytes memory) public {}
}`),
    );

    expect(findings.length).toBe(0);
  });

  it('should detect spaced call syntax', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Spaced {
  function ping(address callee) public {
    callee.call  ("");
    callee.call{ value: 1 } ( "");
  }
}`),
    );

    expect(findings.length).toBe(2);
  });

  it('should provide a require(success) fix recommendation', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract ReturnValue {
  function callnotchecked(address callee) public {
    callee.call("");
  }
}`),
    );

    const finding = findings[0];
    expect(finding).toBeDefined();
    if (!finding) {
      throw new Error('expected a finding for unchecked call');
    }

    const fix = plugin.getFixRecommendation(finding);
    expect(fix).toMatch(/require\s*\(/);
    expect(fix).toContain('require(success)');
    expect(finding.confidence).toBeGreaterThan(0);
    expect(finding.confidence).toBeLessThanOrEqual(1);
    expect(finding.lineStart).toBeGreaterThanOrEqual(1);
  });

  it('should initialize without throwing', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
    await expect(plugin.initialize({})).resolves.toBeUndefined();
  });
});
