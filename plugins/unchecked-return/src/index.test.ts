import type { AnalysisContext } from '@veridion/scanner-types';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

function ctx(sourceCode: string, extra: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    contractName: 'TestContract',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.20',
    metadata: {},
    ...extra,
  };
}

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  it('should have valid metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
    expect(plugin.metadata.severity).toBe('HIGH');
    expect(plugin.metadata.languages).toContain('solidity');
    expect(plugin.metadata.chains).toContain('ethereum');
  });

  it('should initialize without error', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
    await expect(plugin.initialize({})).resolves.toBeUndefined();
  });

  it('should support solidity on EVM chains and reject other languages', () => {
    expect(plugin.supportsContext(ctx(''))).toBe(true);
    expect(plugin.supportsContext(ctx('', { chain: 'polygon' }))).toBe(true);
    expect(plugin.supportsContext(ctx('', { language: 'vyper' }))).toBe(false);
    expect(plugin.supportsContext(ctx('', { chain: 'stellar' }))).toBe(false);
  });

  it('should detect unchecked address.call()', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Caller {
  function sendEther(address callee) external {
    callee.call("");
  }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.pluginId).toBe('unchecked-return');
    expect(findings[0]?.title).toBe('Unchecked Return Value from .call()');
    expect(findings[0]?.lineStart).toBe(4);
  });

  it('should detect unchecked .call() with value and gas options', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract CallerWithOptions {
  function pay(address callee) external payable {
    callee.call{value: msg.value, gas: 5000}("");
  }
}`),
    );

    expect(findings).toHaveLength(1);
  });

  it('should detect multi-line .call() invocations', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract MultiLineCall {
  function sendFunds(address target) external payable {
    target.call{
      value: 1 ether
    }("");
  }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(4);
  });

  it('should detect unchecked address.send()', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Sender {
  function withdraw(address payable recipient, uint256 amount) external {
    recipient.send(amount);
  }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe('Unchecked Return Value from .send()');
  });

  it('should detect unchecked address.delegatecall()', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Proxy {
  function forward(address target, bytes memory data) external {
    target.delegatecall(data);
  }
}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe('Unchecked Return Value from .delegatecall()');
  });

  it('should detect ignored return value in tuple assignment', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract IgnoredBool {
  function execute(address target) external {
    (, bytes memory data) = target.call("");
  }
}`),
    );

    expect(findings).toHaveLength(1);
  });

  it('should detect captured return variable that is never checked', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract UnusedSuccess {
  function transferEther(address payable target, uint256 amount) external {
    (bool success, ) = target.call{value: amount}("");
    uint256 x = 1;
  }
}`),
    );

    expect(findings).toHaveLength(1);
  });

  it('should not flag require(callee.call())', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SafeCall {
  function ping(address callee) external {
    require(callee.call(""));
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag require(recipient.send(amount))', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SafeSend {
  function withdraw(address payable recipient, uint256 amount) external {
    require(recipient.send(amount), "Send failed");
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag if (!recipient.send(amount)) revert()', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SafeSendIf {
  function withdraw(address payable recipient, uint256 amount) external {
    if (!recipient.send(amount)) {
      revert();
    }
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag return value checked with require(success)', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SafeCallRequire {
  function transferEther(address payable target, uint256 amount) external {
    (bool success, ) = target.call{value: amount}("");
    require(success, "Call failed");
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag delegatecall checked with require(success)', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SafeDelegateCall {
  function forward(address target, bytes memory data) external {
    (bool success, bytes memory result) = target.delegatecall(data);
    require(success, "Delegatecall failed");
    result;
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag address.transfer() as it reverts on failure', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SafeTransfer {
  function withdraw(address payable recipient, uint256 amount) external {
    recipient.transfer(amount);
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should ignore calls in single-line and multi-line comments', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Commented {
  function ping(address callee) external {
    // callee.call("");
    /*
     * callee.send(1);
     */
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should ignore call identifiers inside string literals', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract Strings {
  function message() external pure returns (string memory) {
    return "callee.call() failed";
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should not flag identifiers like abi.encodeCall', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract SimilarNames {
  function encode(address callee) external pure returns (bytes memory) {
    return abi.encodeCall(this.encode, (callee));
  }
}`),
    );

    expect(findings).toHaveLength(0);
  });

  it('should return empty findings for empty source code', async () => {
    expect(await plugin.analyze(ctx(''))).toEqual([]);
  });

  it('should detect multiple unchecked calls in a single contract', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract MultipleCalls {
  function test(address payable a, address b) external {
    a.send(1 ether);
    b.call("");
    b.delegatecall("");
  }
}`),
    );

    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.lineStart)).toEqual([4, 5, 6]);
  });

  it('should provide fix recommendations containing require(success)', async () => {
    const findings = await plugin.analyze(
      ctx(`
contract NeedsFix {
  function ping(address callee) external {
    callee.call("");
  }
}`),
    );

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding).toBeDefined();
    if (!finding) return;

    const fix = plugin.getFixRecommendation(finding);
    expect(fix).toContain('require(success');
    expect(fix).toContain('.call()');
    expect(fix).toContain('.send()');
    expect(fix).toContain('.delegatecall()');
  });
});
