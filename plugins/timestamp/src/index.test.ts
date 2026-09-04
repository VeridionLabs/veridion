import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { describe, expect, it } from 'vitest';

import { TimestampPlugin } from './index';

function createMockContext(sourceCode: string, overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    contractName: 'TimeLock',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.20',
    metadata: {},
    ...overrides,
  };
}

describe('TimestampPlugin', () => {
  const plugin = new TimestampPlugin();

  describe('metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.metadata.id).toBe('timestamp');
      expect(plugin.metadata.name).toBe('Timestamp Dependence Detector');
      expect(plugin.metadata.severity).toBe(FindingSeverity.LOW);
      expect(plugin.metadata.category).toBe('TIMESTAMP');
      expect(plugin.metadata.languages).toContain('solidity');
      expect(plugin.metadata.chains).toContain('ethereum');
      expect(plugin.metadata.tags).toContain('swc-116');
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
    });
  });

  describe('analyze', () => {
    it('should detect block.timestamp in require statement', async () => {
      const code = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Lock {
    uint256 public unlockTime;

    function withdraw() external {
        require(block.timestamp >= unlockTime, "Too early");
        payable(msg.sender).transfer(1 ether);
    }
}
      `.trim();

      const findings = await plugin.analyze(createMockContext(code));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Timestamp Dependence in Conditional Logic');
      expect(findings[0]?.severity).toBe(FindingSeverity.LOW);
      expect(findings[0]?.lineStart).toBe(8);
      expect(findings[0]?.confidence).toBe(0.85);
    });

    it('should detect block.timestamp in if statement', async () => {
      const code = `
contract Lottery {
    function pickWinner() external {
        if (block.timestamp % 2 == 0) {
            msg.sender.call("");
        }
    }
}
      `.trim();

      const findings = await plugin.analyze(createMockContext(code));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Timestamp Dependence in Conditional Logic');
      expect(findings[0]?.codeSnippet).toContain('if (block.timestamp % 2 == 0)');
    });

    it('should detect legacy now keyword usage', async () => {
      const code = `
pragma solidity ^0.5.0;

contract LegacyAuction {
    uint public end;

    function bid() public payable {
        require(now <= end);
    }
}
      `.trim();

      const findings = await plugin.analyze(createMockContext(code));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Legacy "now" Keyword Used');
      expect(findings[0]?.severity).toBe(FindingSeverity.LOW);
      expect(findings[0]?.codeSnippet).toContain('require(now <= end)');
      expect(findings[0]?.confidence).toBe(0.9);
    });

    it('should detect multiple timestamp dependencies across different lines', async () => {
      const code = `
contract MultiCheck {
    function check(uint target) external view returns (bool) {
        assert(block.timestamp > 1000);
        if (block.timestamp == target) return true;
        return false;
    }
}
      `.trim();

      const findings = await plugin.analyze(createMockContext(code));

      expect(findings).toHaveLength(2);
      expect(findings[0]?.lineStart).toBe(3);
      expect(findings[1]?.lineStart).toBe(4);
    });

    it('should not flag safe timestamp usage without conditional logic', async () => {
      const code = `
contract SafeLogger {
    event LogTime(uint256 time);
    uint256 public lastAccess;

    function record() external {
        lastAccess = block.timestamp;
        emit LogTime(block.timestamp);
    }
}
      `.trim();

      const findings = await plugin.analyze(createMockContext(code));

      expect(findings).toHaveLength(0);
    });

    it('should ignore commented out timestamp checks', async () => {
      const code = `
contract Commented {
    function test() external {
        // require(block.timestamp > 0);
        /* if (now > 10) {} */
        uint256 x = 1;
    }
}
      `.trim();

      const findings = await plugin.analyze(createMockContext(code));

      expect(findings).toHaveLength(0);
    });
  });

  describe('getFixRecommendation', () => {
    it('should return a detailed fix recommendation', () => {
      const finding = {
        pluginId: 'timestamp',
        title: 'Timestamp Dependence',
        description: 'Mock',
        severity: FindingSeverity.LOW,
        filePath: 'contracts/Vault.sol',
        lineStart: 15,
        lineEnd: 15,
        codeSnippet: 'require(block.timestamp > deadline);',
        recommendation: 'Fix',
        confidence: 0.85,
        references: [],
      };

      const fix = plugin.getFixRecommendation(finding);
      expect(fix).toContain('contracts/Vault.sol:15');
      expect(fix).toContain('15 seconds');
      expect(fix).toContain('block.number');
    });
  });

  describe('supportsContext', () => {
    it('should support solidity contracts on ethereum', () => {
      expect(
        plugin.supportsContext(createMockContext('', { chain: 'ethereum', language: 'solidity' })),
      ).toBe(true);
    });

    it('should support polygon and bsc chains', () => {
      expect(
        plugin.supportsContext(createMockContext('', { chain: 'polygon', language: 'solidity' })),
      ).toBe(true);
      expect(
        plugin.supportsContext(createMockContext('', { chain: 'bsc', language: 'solidity' })),
      ).toBe(true);
    });

    it('should not support unsupported chains or languages', () => {
      expect(
        plugin.supportsContext(createMockContext('', { chain: 'solana', language: 'rust' })),
      ).toBe(false);
      expect(
        plugin.supportsContext(createMockContext('', { chain: 'ethereum', language: 'vyper' })),
      ).toBe(false);
    });
  });
});
