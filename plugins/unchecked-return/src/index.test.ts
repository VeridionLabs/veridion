import { describe, expect, it } from 'vitest';
import { UncheckedReturnValuePlugin } from './index';
import type { AnalysisContext } from '@veridion/scanner-types';

function createContext(sourceCode: string): AnalysisContext {
  return {
    contractName: 'Test',
    sourceCode,
    ast: null,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.19',
    metadata: {},
  };
}

async function analyze(sourceCode: string) {
  const plugin = new UncheckedReturnValuePlugin();
  await plugin.initialize();
  return plugin.analyze(createContext(sourceCode));
}

const HEADER = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Test {
`;
const FOOTER = `
}
`;

function wrap(body: string): string {
  return `${HEADER}${body}${FOOTER}`;
}

describe('UncheckedReturnValuePlugin metadata', () => {
  it('exposes the expected metadata', () => {
    const plugin = new UncheckedReturnValuePlugin();
    expect(plugin.metadata.id).toBe('unchecked-return-value');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
    expect(plugin.metadata.languages).toContain('solidity');
    expect(plugin.metadata.chains).toContain('ethereum');
  });
});

describe('UncheckedReturnValuePlugin - unsafe patterns', () => {
  it('flags a bare unchecked .call()', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          to.call{value: 1 ether}("");
        }
      `),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].pluginId).toBe('unchecked-return-value');
    expect(findings[0].title).toContain('call');
    expect(findings[0].recommendation).toContain('require(success');
  });

  it('flags a bare unchecked .send()', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          to.send(1 ether);
        }
      `),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('send');
  });

  it('flags a bare unchecked .delegatecall()', async () => {
    const findings = await analyze(
      wrap(`
        function upgrade(address impl, bytes memory data) external {
          impl.delegatecall(data);
        }
      `),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('delegatecall');
  });

  it('flags a call assigned to a variable that is never checked', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          bool success = to.call{value: 1 ether}("");
        }
      `),
    );

    expect(findings).toHaveLength(1);
  });

  it('reports the line number correctly', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          to.call{value: 1 ether}("");
        }
      `),
    );

    expect(findings[0].lineStart).toBeGreaterThan(0);
    expect(findings[0].lineEnd).toBe(findings[0].lineStart);
  });
});

describe('UncheckedReturnValuePlugin - safe patterns', () => {
  it('does not flag a call directly wrapped in require()', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          require(to.call{value: 1 ether}(""));
        }
      `),
    );

    expect(findings).toHaveLength(0);
  });

  it('does not flag a call assigned then checked with require(success)', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          (bool success, ) = to.call{value: 1 ether}("");
          require(success, "call failed");
        }
      `),
    );

    expect(findings).toHaveLength(0);
  });

  it('does not flag a call assigned then checked with an if/revert guard', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          bool success = to.send(1 ether);
          if (!success) {
            revert("send failed");
          }
        }
      `),
    );

    expect(findings).toHaveLength(0);
  });

  it('does not flag a call used directly as an if condition', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          if (to.call{value: 1 ether}("")) {
            emit Sent();
          }
        }
      `),
    );

    expect(findings).toHaveLength(0);
  });

  it('does not flag .transfer()', async () => {
    const findings = await analyze(
      wrap(`
        function withdraw(address payable to) external {
          to.transfer(1 ether);
        }
      `),
    );

    expect(findings).toHaveLength(0);
  });

  it('does not flag ordinary function calls', async () => {
    const findings = await analyze(
      wrap(`
        function helper(uint256 a, uint256 b) external pure returns (uint256) {
          return add(a, b);
        }

        function add(uint256 a, uint256 b) internal pure returns (uint256) {
          return a + b;
        }
      `),
    );

    expect(findings).toHaveLength(0);
  });
});

describe('UncheckedReturnValuePlugin - multiple call sites', () => {
  it('flags each unsafe call independently', async () => {
    const findings = await analyze(
      wrap(`
        function a(address payable to) external {
          to.call{value: 1 ether}("");
        }

        function b(address payable to) external {
          (bool ok, ) = to.call{value: 1 ether}("");
          require(ok, "failed");
        }

        function c(address payable to) external {
          to.send(1 ether);
        }
      `),
    );

    expect(findings).toHaveLength(2);
  });
});
