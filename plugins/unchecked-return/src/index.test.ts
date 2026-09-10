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

  describe('metadata', () => {
    it('should describe SWC-104 unchecked return detection', () => {
      expect(plugin.metadata.id).toBe('unchecked-return');
      expect(plugin.metadata.name).toBe('Unchecked Return Value Detector');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
      expect(plugin.metadata.severity).toBe('HIGH');
      expect(plugin.metadata.languages).toContain('solidity');
      expect(plugin.metadata.chains).toContain('ethereum');
      expect(plugin.metadata.tags).toContain('swc-104');
    });
  });

  describe('initialize / supportsContext / recommendations', () => {
    it('should initialize without error', async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
      await expect(plugin.initialize({})).resolves.toBeUndefined();
    });

    it('should support solidity on EVM chains and reject others', () => {
      expect(plugin.supportsContext(ctx(''))).toBe(true);
      expect(plugin.supportsContext(ctx('', { chain: 'polygon' }))).toBe(true);
      expect(plugin.supportsContext(ctx('', { language: 'vyper' }))).toBe(false);
      expect(plugin.supportsContext(ctx('', { chain: 'stellar' }))).toBe(false);
    });

    it('should provide require(success) fix recommendations', async () => {
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
      expect(finding.pluginId).toBe('unchecked-return');
      expect(finding.confidence).toBeGreaterThan(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
      expect(finding.references.length).toBeGreaterThan(0);
    });
  });

  describe('positive detections', () => {
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

    it('should detect discarded underscore bool slot', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract Discarded {
  function execute(address target) external {
    (_, bytes memory data) = target.call("");
  }
}`),
      );

      expect(findings).toHaveLength(1);
    });

    it('should still report when a later require compares success to trueFlag', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract FakeLiteral {
  function execute(address target, bool trueFlag) external {
    (bool ok, ) = target.call("");
    require(ok == trueFlag);
  }
}`),
      );

      expect(findings).toHaveLength(1);
    });

    it('should still report when require compares untrue == ok', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract ReversedFakeLiteral {
  function execute(address target, bool untrue) external {
    (bool ok, ) = target.call("");
    require(untrue == ok);
  }
}`),
      );

      expect(findings).toHaveLength(1);
    });

    it('should detect a call used as an if-body, not an if-condition', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract IfBody {
  function execute(address target, bool ready) external {
    if (ready) target.call("");
  }
}`),
      );

      expect(findings).toHaveLength(1);
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
  });

  describe('safe code', () => {
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

    it('should not flag return target.call("")', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract SafeReturn {
  function ping(address callee) external returns (bool, bytes memory) {
    return callee.call("");
  }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('should not flag assert(callee.call())', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract SafeAssert {
  function ping(address callee) external {
    assert(callee.call(""));
  }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('should not flag require(false == ok) with a real reversed literal', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract SafeReversedLiteral {
  function execute(address target) external {
    (bool ok, ) = target.call("");
    require(false != ok);
  }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('should not treat a later function require as a check for this call', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract SplitFunctions {
  function execute(address target) external {
    (bool ok, ) = target.call("");
  }

  function other(bool ok) external pure {
    require(ok);
  }
}`),
      );

      expect(findings).toHaveLength(1);
    });

    it('should not flag require(success == true) with a real boolean literal', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract SafeLiteral {
  function transferEther(address payable target, uint256 amount) external {
    (bool success, ) = target.call{value: amount}("");
    require(success == true);
  }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('should not flag if (!success) revert after capturing the flag', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract SafeIf {
  function transferEther(address payable target, uint256 amount) external {
    (bool success, ) = target.call{value: amount}("");
    if (!success) {
      revert("Call failed");
    }
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

    it('should not flag bool sent = addr.send() when later required', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract SafeSendAssign {
  function withdraw(address payable recipient, uint256 amount) external {
    bool sent = recipient.send(amount);
    require(sent);
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

    it('should return empty findings for contracts without low-level calls', async () => {
      const findings = await plugin.analyze(
        ctx(`
contract Safe {
  uint256 public value;
  function setValue(uint256 _value) public {
    value = _value;
  }
}`),
      );
      expect(findings).toHaveLength(0);
    });
  });
});
