import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

function makeContext(
  sourceCode: string,
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext {
  return {
    contractName: 'Vault',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.19',
    metadata: {},
    ...overrides,
  };
}

describe('UncheckedReturnPlugin', () => {
  let plugin: UncheckedReturnPlugin;

  beforeEach(() => {
    plugin = new UncheckedReturnPlugin();
  });

  describe('metadata', () => {
    it('exposes a kebab-case id matching the directory name', () => {
      expect(plugin.metadata.id).toBe('unchecked-return');
    });

    it('is categorised as UNCHECKED_RETURN with HIGH default severity', () => {
      expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
      expect(plugin.metadata.severity).toBe(FindingSeverity.HIGH);
    });

    it('declares supported chains, languages and references', () => {
      expect(plugin.metadata.chains).toContain('ethereum');
      expect(plugin.metadata.languages).toContain('solidity');
      expect(plugin.metadata.references?.length ?? 0).toBeGreaterThan(0);
    });
  });

  describe('initialize', () => {
    it('resolves without configuration', async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
    });

    it('accepts an arbitrary configuration object', async () => {
      await expect(plugin.initialize({ includeErc20: true })).resolves.toBeUndefined();
    });
  });

  describe('supportsContext', () => {
    it('supports solidity on a declared chain', () => {
      expect(plugin.supportsContext(makeContext('contract A {}'))).toBe(true);
    });

    it('rejects unsupported chains', () => {
      expect(plugin.supportsContext(makeContext('contract A {}', { chain: 'solana' }))).toBe(false);
    });

    it('rejects unsupported languages', () => {
      expect(plugin.supportsContext(makeContext('contract A {}', { language: 'vyper' }))).toBe(
        false,
      );
    });
  });

  describe('low-level call detection', () => {
    it('detects an unchecked .call() return value', async () => {
      const findings = await plugin.analyze(
        makeContext(`pragma solidity ^0.8.0;
contract Vault {
    function pay(address to) public {
        to.call{value: 1 ether}("");
    }
}`),
      );

      expect(findings).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.severity).toBe(FindingSeverity.HIGH);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects an unchecked .send() return value', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public {
        to.send(1 ether);
    }
}`),
      );

      expect(findings).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.title).toContain('send');
    });

    it('detects an unchecked .delegatecall() return value', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function exec(address impl, bytes memory data) public {
        impl.delegatecall(data);
    }
}`),
      );

      expect(findings).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.title).toContain('delegatecall');
    });

    it('reports the 1-based line number of the offending statement', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public {
        to.call("");
    }
}`),
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.lineStart).toBe(3);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.lineEnd).toBeGreaterThanOrEqual(findings[0]!.lineStart);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.codeSnippet).toContain('.call');
    });

    it('detects several unchecked calls in one contract', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function a(address t) public { t.call(""); }
    function b(address t) public { t.send(1); }
}`),
      );

      expect(findings).toHaveLength(2);
    });
  });

  describe('ERC-20 detection', () => {
    it('detects an unchecked two-argument .transfer()', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address token, address to) public {
        IERC20(token).transfer(to, 100);
    }
}`),
      );

      expect(findings).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.severity).toBe(FindingSeverity.MEDIUM);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.confidence).toBeLessThan(0.9);
    });

    it('detects unchecked transferFrom() and approve()', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function sweep(address token) public {
        IERC20(token).transferFrom(msg.sender, address(this), 100);
        IERC20(token).approve(msg.sender, 100);
    }
}`),
      );

      expect(findings).toHaveLength(2);
    });

    it('ignores the native single-argument .transfer() because it reverts on failure', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address payable to) public {
        to.transfer(1 ether);
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('ignores SafeERC20 helpers', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(IERC20 token, address to) public {
        token.safeTransfer(to, 100);
        token.safeTransferFrom(msg.sender, to, 100);
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });
  });

  describe('safe patterns that must not be flagged', () => {
    it('accepts a call wrapped in require()', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public {
        require(to.call{value: 1 ether}(""), "call failed");
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('accepts a send wrapped in an if statement', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public {
        if (!to.send(1 ether)) revert("send failed");
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('accepts a tuple assignment validated by require(success)', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public {
        (bool success, ) = to.call{value: 1 ether}("");
        require(success, "call failed");
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('accepts a bool assignment validated later', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public {
        bool sent = to.send(1 ether);
        if (!sent) revert("send failed");
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('accepts a return value propagated to the caller', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public returns (bool) {
        return to.send(1 ether);
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('accepts ERC-20 transfers wrapped in require()', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(IERC20 token, address to) public {
        require(token.transfer(to, 100), "transfer failed");
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('returns no findings for an empty contract', async () => {
      await expect(plugin.analyze(makeContext(''))).resolves.toEqual([]);
    });

    it('returns no findings for a contract without external calls', async () => {
      const findings = await plugin.analyze(
        makeContext(`pragma solidity ^0.8.0;
contract Vault {
    uint256 public total;
    function add(uint256 x) public { total += x; }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('ignores calls that only appear in comments', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    // to.call("");
    /* to.send(1 ether); */
    function pay(address to) public {
        // to.call("");
    }
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('ignores call-looking text inside string literals', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    string public note = "to.call(\\"\\")";
}`),
      );

      expect(findings).toHaveLength(0);
    });

    it('handles a multi-line call statement and reports the first line', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public {
        to.call{
            value: 1 ether
        }("");
    }
}`),
      );

      expect(findings).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(findings[0]!.lineStart).toBe(3);
    });

    it('does not confuse the member access of a struct with a call', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    struct Config { bool send; uint256 call; }
    function read(Config memory c) public pure returns (bool) { return c.send; }
}`),
      );

      expect(findings).toHaveLength(0);
    });
  });

  describe('finding structure', () => {
    it('stamps every finding with the plugin id and file path', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public { to.call(""); }
}`),
      );

      expect(findings.length).toBeGreaterThan(0);
      for (const finding of findings) {
        expect(finding.pluginId).toBe('unchecked-return');
        expect(finding.filePath).toBe('Vault.sol');
        expect(finding.references.length).toBeGreaterThan(0);
        expect(finding.recommendation.length).toBeGreaterThan(0);
        expect(finding.confidence).toBeGreaterThan(0);
        expect(finding.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('getFixRecommendation', () => {
    it('recommends the require(success) pattern', async () => {
      const findings = await plugin.analyze(
        makeContext(`contract Vault {
    function pay(address to) public { to.call(""); }
}`),
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const recommendation = plugin.getFixRecommendation(findings[0]!);

      expect(recommendation).toContain('require(success');
      expect(recommendation).toContain('bool success');
      expect(recommendation).toContain('Vault.sol');
    });
  });
});
