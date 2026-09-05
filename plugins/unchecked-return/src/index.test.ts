import { PluginRegistry } from '@veridion/scanner-core';
import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

function createMockContext(
  sourceCode: string,
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext {
  return {
    contractName: 'TestContract',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.20',
    metadata: {},
    ...overrides,
  };
}

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  describe('Plugin Metadata and Interface', () => {
    it('should have correct metadata attributes conforming to repository conventions', () => {
      expect(plugin.metadata.id).toBe('unchecked-return');
      expect(plugin.metadata.name).toBe('Unchecked Return Value Detector');
      expect(plugin.metadata.severity).toBe(FindingSeverity.HIGH);
      expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
      expect(plugin.metadata.languages).toContain('solidity');
      expect(plugin.metadata.chains).toContain('ethereum');
      expect(plugin.metadata.chains).toContain('polygon');
      expect(plugin.metadata.chains).toContain('arbitrum');
      expect(plugin.metadata.tags).toContain('unchecked-return');
      expect(plugin.metadata.tags).toContain('swc-104');
      expect(plugin.metadata.references).toBeDefined();
      expect(plugin.metadata.references?.some((r) => r.includes('SWC-104'))).toBe(true);
    });

    it('should initialize without error', async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
      await expect(plugin.initialize({ someConfig: true })).resolves.toBeUndefined();
    });

    it('should support solidity on EVM chains', () => {
      expect(plugin.supportsContext(createMockContext(''))).toBe(true);
      expect(
        plugin.supportsContext(createMockContext('', { chain: 'polygon', language: 'solidity' })),
      ).toBe(true);
      expect(
        plugin.supportsContext(createMockContext('', { chain: 'arbitrum', language: 'solidity' })),
      ).toBe(true);
    });

    it('should reject unsupported languages or unsupported chains', () => {
      expect(plugin.supportsContext(createMockContext('', { language: 'vyper' }))).toBe(false);
      expect(plugin.supportsContext(createMockContext('', { language: 'rust' }))).toBe(false);
      expect(plugin.supportsContext(createMockContext('', { chain: 'stellar' }))).toBe(false);
      expect(plugin.supportsContext(createMockContext('', { chain: 'solana' }))).toBe(false);
    });

    it('should return empty findings for unsupported context or empty code', async () => {
      const unsupported = await plugin.analyze(createMockContext('', { language: 'rust' }));
      expect(unsupported).toEqual([]);

      const empty = await plugin.analyze(createMockContext(''));
      expect(empty).toEqual([]);

      const nonString = await plugin.analyze({
        contractName: 'Test',
        sourceCode: null as unknown as string,
        chain: 'ethereum',
        language: 'solidity',
        compilerVersion: '0.8.20',
        metadata: {},
      });
      expect(nonString).toEqual([]);
    });

    it('should return no findings for contracts without low-level calls', async () => {
      const code = `
        contract SafeContract {
          uint256 public counter;
          function increment() external {
            counter++;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });
  });

  describe('Unchecked .call() Detection (Positive Tests)', () => {
    it('should detect raw unchecked address.call()', async () => {
      const code = `
        contract Caller {
          function rawCall(address callee) external {
            callee.call("");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      const finding = findings[0];
      expect(finding).toBeDefined();
      if (!finding) return;
      expect(finding.pluginId).toBe('unchecked-return');
      expect(finding.title).toBe('Unchecked Return Value from .call()');
      expect(finding.severity).toBe(FindingSeverity.HIGH);
      expect(finding.filePath).toBe('TestContract.sol');
      expect(finding.lineStart).toBe(4);
      expect(finding.codeSnippet).toContain('callee.call("")');
      expect(finding.recommendation).toContain('require(success');
      expect(finding.confidence).toBe(0.9);
      expect(finding.references).toContain('https://swcregistry.io/docs/SWC-104');
    });

    it('should detect unchecked .call() with value and gas options', async () => {
      const code = `
        contract Payment {
          function sendEther(address payable recipient, uint256 amount) external {
            recipient.call{value: amount, gas: 5000}("");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.codeSnippet).toContain('recipient.call{value: amount, gas: 5000}("")');
    });

    it('should detect unchecked .call() with spaced or formatted syntax', async () => {
      const code = `
        contract Spaced {
          function execute(address target) external {
            target.call   { value: 100 }   ( "" ) ;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.lineStart).toBe(4);
    });

    it('should detect unchecked multiline .call()', async () => {
      const code = `
        contract MultilineCall {
          function execute(address target) external {
            target.call{
              value: 1 ether
            }("");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.lineStart).toBe(4);
    });

    it('should detect call when return tuple explicitly omits boolean success', async () => {
      const code = `
        contract IgnoreSuccess {
          function callTarget(address target) external {
            (, bytes memory data) = target.call("");
            data;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toContain('call');
    });

    it('should detect call when return tuple uses underscore for success', async () => {
      const code = `
        contract UnderscoreSuccess {
          function callTarget(address target) external {
            (bool _, bytes memory data) = target.call("");
            data;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
    });

    it('should detect call when return value is assigned to a variable but never validated', async () => {
      const code = `
        contract AssignedNotChecked {
          function callTarget(address target) external {
            (bool success, ) = target.call("");
            uint256 x = 1 + 2;
            x;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.recommendation).toContain('require(success');
    });
  });

  describe('Checked .call() Detection (Negative Tests - No False Positives)', () => {
    it('should not flag .call() checked with require(success)', async () => {
      const code = `
        contract SafeCall {
          function sendEth(address recipient, uint256 amount) external {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "Payment failed");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag .call() checked with require(success && otherCondition)', async () => {
      const code = `
        contract SafeCallComplex {
          function sendEth(address recipient, uint256 amount) external {
            (bool success, bytes memory data) = recipient.call{value: amount}("");
            require(success && data.length >= 0, "Failed");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag .call() checked with if (!success) revert', async () => {
      const code = `
        contract SafeCallIf {
          function execute(address target) external {
            (bool ok, ) = target.call("");
            if (!ok) {
              revert("Call failed");
            }
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag .call() checked with if (success == false) revert', async () => {
      const code = `
        contract SafeCallIfFalse {
          function execute(address target) external {
            (bool ok, ) = target.call("");
            if (ok == false) revert CustomError();
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag .call() checked with assert(success)', async () => {
      const code = `
        contract SafeCallAssert {
          function execute(address target) external {
            (bool success, ) = target.call("");
            assert(success);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag multiline assignment of .call() when verified with require', async () => {
      const code = `
        contract SafeMultiline {
          function execute(address target, uint256 amount) external {
            (bool success, ) =
                target.call{value: amount}("");
            require(success, "Transaction reverted");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag direct inline require(target.call(""))', async () => {
      const code = `
        contract DirectRequireCall {
          function execute(address target) external {
            require(target.call(""));
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });
  });

  describe('Unchecked .send() Detection (Positive Tests)', () => {
    it('should detect raw unchecked address.send()', async () => {
      const code = `
        contract UncheckedSend {
          function refund(address payable recipient, uint256 amount) external {
            recipient.send(amount);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Unchecked Return Value from .send()');
      expect(findings[0]?.lineStart).toBe(4);
      expect(findings[0]?.codeSnippet).toContain('recipient.send(amount);');
    });

    it('should detect payable-cast unchecked send', async () => {
      const code = `
        contract PayableCastSend {
          function refund(address recipient, uint256 amount) external {
            payable(recipient).send(amount);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.lineStart).toBe(4);
    });

    it('should detect unchecked .send() inside an if body (NOT inside condition)', async () => {
      const code = `
        contract ConditionalSend {
          function withdraw(address payable recipient, uint256 amount) external {
            if (address(this).balance >= amount) {
              recipient.send(amount);
            }
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.lineStart).toBe(5);
    });

    it('should detect single-line if statement containing unchecked .send() in body', async () => {
      const code = `
        contract SingleLineIfSend {
          function withdraw(address payable recipient, uint256 amount) external {
            if (amount > 0) recipient.send(amount);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.lineStart).toBe(4);
    });

    it('should detect .send() assigned to variable but never validated', async () => {
      const code = `
        contract SendAssignedNotChecked {
          function refund(address payable recipient, uint256 amount) external {
            bool sent = recipient.send(amount);
            uint256 x = 42;
            x;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toContain('send');
    });
  });

  describe('Checked .send() Detection (Negative Tests - No False Positives)', () => {
    it('should not flag require(recipient.send(amount))', async () => {
      const code = `
        contract SafeSend {
          function refund(address payable recipient, uint256 amount) external {
            require(recipient.send(amount));
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag require(payable(recipient).send(amount), "msg") with nested parens', async () => {
      const code = `
        contract SafeNestedSend {
          function refund(address recipient, uint256 amount) external {
            require(payable(recipient).send(amount), "Refund failed");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag if (!recipient.send(amount)) revert()', async () => {
      const code = `
        contract SafeIfSend {
          function refund(address payable recipient, uint256 amount) external {
            if (!recipient.send(amount)) {
              revert("Send failed");
            }
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag send return assigned to variable and checked with require', async () => {
      const code = `
        contract SafeAssignedSend {
          function refund(address payable recipient, uint256 amount) external {
            bool success = recipient.send(amount);
            require(success, "Failed to send");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag return recipient.send(amount) propagating status to caller', async () => {
      const code = `
        contract ReturnSend {
          function refund(address payable recipient, uint256 amount) external returns (bool) {
            return recipient.send(amount);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });
  });

  describe('Unchecked .delegatecall() Detection (Positive Tests)', () => {
    it('should detect raw unchecked address.delegatecall()', async () => {
      const code = `
        contract Proxy {
          function forward(address target, bytes memory data) external {
            target.delegatecall(data);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Unchecked Return Value from .delegatecall()');
      expect(findings[0]?.lineStart).toBe(4);
      expect(findings[0]?.codeSnippet).toContain('target.delegatecall(data);');
    });

    it('should detect unchecked .delegatecall() with gas option', async () => {
      const code = `
        contract ProxyWithGas {
          function forward(address target, bytes memory data) external {
            target.delegatecall{gas: 10000}(data);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.codeSnippet).toContain('target.delegatecall{gas: 10000}(data);');
    });

    it('should detect .delegatecall() captured in tuple but never validated', async () => {
      const code = `
        contract ProxyUnusedResult {
          function forward(address target, bytes memory data) external {
            (bool ok, bytes memory res) = target.delegatecall(data);
            res;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toContain('delegatecall');
    });
  });

  describe('Checked .delegatecall() Detection (Negative Tests - No False Positives)', () => {
    it('should not flag .delegatecall() checked with require(success)', async () => {
      const code = `
        contract SafeProxy {
          function forward(address target, bytes memory data) external {
            (bool success, bytes memory result) = target.delegatecall(data);
            require(success, "Delegatecall execution failed");
            result;
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag .delegatecall() checked with if (!ok) revert', async () => {
      const code = `
        contract SafeProxyIf {
          function forward(address target, bytes memory data) external {
            (bool ok, ) = target.delegatecall(data);
            if (!ok) revert("Proxy failed");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag inline require(target.delegatecall(data))', async () => {
      const code = `
        contract SafeInlineDelegatecall {
          function forward(address target, bytes memory data) external {
            require(target.delegatecall(data));
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });
  });

  describe('Exclusions and Edge Cases (Solidity Specifics)', () => {
    it('should NOT flag address.transfer() as it reverts automatically on failure without returning a bool', async () => {
      const code = `
        contract SafeTransfer {
          function withdraw(address payable recipient, uint256 amount) external {
            recipient.transfer(amount);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should ignore single-line comments mentioning low-level calls', async () => {
      const code = `
        contract Commented {
          function test(address target) external {
            // target.call("");
            // recipient.send(1);
            // target.delegatecall(data);
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should ignore multi-line block comments mentioning low-level calls', async () => {
      const code = `
        contract BlockCommented {
          function test(address target) external {
            /*
             * target.call("");
             * recipient.send(1);
             */
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should ignore string literals mentioning low-level calls', async () => {
      const code = `
        contract StringLiteral {
          function getErrorMessage() external pure returns (string memory) {
            string memory a = 'callee.call(\\'\\') failed';
            return "callee.call() failed: do not ignore return value";
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should handle scoped block closures when validating assigned variables', async () => {
      const code = `
        contract BlockScoping {
          function test(address target) external {
            {
              (bool ok, ) = target.call("");
              ok;
            }
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(1);
    });

    it('should ignore abi.encodeCall and other non-low-level call identifiers', async () => {
      const code = `
        contract EncodeCallTest {
          function encode(address target) external pure returns (bytes memory) {
            return abi.encodeCall(this.encode, (target));
          }
          function mycallback() external {}
          function sendNotification() external {}
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(0);
    });

    it('should correctly handle multiple unchecked calls in the same contract', async () => {
      const code = `
        contract MultiUnchecked {
          function test(address payable a, address b) external {
            a.send(1 ether);
            b.call("");
            b.delegatecall("");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code));
      expect(findings).toHaveLength(3);
      expect(findings.map((f) => f.lineStart)).toEqual([4, 5, 6]);
    });
  });

  describe('Fix Recommendation Formatting', () => {
    it('should provide fix recommendations containing require(success) pattern', async () => {
      const code = `
        contract FixDemo {
          function transfer(address callee) external {
            callee.call("");
          }
        }
      `;
      const findings = await plugin.analyze(createMockContext(code, { contractName: 'FixDemo' }));
      expect(findings).toHaveLength(1);
      const finding = findings[0];
      expect(finding).toBeDefined();
      if (!finding) return;
      const fix = plugin.getFixRecommendation(finding);
      expect(fix).toContain('require(success');
      expect(fix).toContain('.call()');
      expect(fix).toContain('.send()');
      expect(fix).toContain('.delegatecall()');
      expect(fix).toContain('FixDemo.sol:4');
    });
  });

  describe('PluginRegistry Registration Integration', () => {
    it('should register successfully in PluginRegistry and be retrievable', () => {
      const registry = new PluginRegistry();
      registry.register(new UncheckedReturnPlugin());

      expect(registry.size).toBe(1);
      const registered = registry.get('unchecked-return');
      expect(registered).toBeDefined();
      expect(registered?.metadata.id).toBe('unchecked-return');
      expect(registered?.metadata.category).toBe('UNCHECKED_RETURN');
    });
  });
});
