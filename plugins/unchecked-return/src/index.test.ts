import type {
  AnalysisContext,
  IRulePlugin,
} from '@veridion/scanner-types';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

function context(sourceCode: string): AnalysisContext {
  return {
    contractName: 'Test',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.19',
    metadata: {},
  };
}

function source(body: string): string {
  return `pragma solidity ^0.8.19;
contract Test {
  event Result(bool success);
  function run(
    address payable target,
    bytes memory data,
    uint256 amount
  ) external payable {
    ${body}
  }
}`;
}

const plugin = new UncheckedReturnPlugin();

async function analyze(body: string) {
  return plugin.analyze(context(source(body)));
}

describe('UncheckedReturnPlugin', () => {
  it('implements IRulePlugin and exposes metadata', async () => {
    const rule: IRulePlugin = plugin;

expect(rule.metadata).toMatchObject({
      id: 'unchecked-return',
      category: 'UNCHECKED_RETURN',
      severity: 'HIGH',
    });
    expect(rule.metadata.references).not.toHaveLength(0);

await expect(rule.initialize()).resolves.toBeUndefined();
    await expect(rule.initialize({ enabled: true })).resolves.toBeUndefined();
  });

it.each([
    'ethereum',
    'polygon',
    'bsc',
    'avalanche',
    'arbitrum',
    'optimism',
  ])('supports Solidity on %s', (chain) => {
    expect(plugin.supportsContext({ ...context(''), chain })).toBe(true);
  });

it.each([
    { chain: 'solana', language: 'solidity' },
    { chain: 'ethereum', language: 'vyper' },
  ])('rejects unsupported contexts: %o', async (overrides) => {
    const input = { ...context(source('target.call(data);')), ...overrides };

expect(plugin.supportsContext(input)).toBe(false);
    await expect(plugin.analyze(input)).resolves.toEqual([]);
  });

it.each(['', '   \n', 'contract Empty {}'])(
    'handles empty input: %j',
    async (input) => {
      await expect(plugin.analyze(context(input))).resolves.toEqual([]);
    },
  );

it('rejects malformed Solidity rather than reporting a clean scan', async () => {
    await expect(
      plugin.analyze(context('contract Broken { function')),
    ).rejects.toThrow();
  });

describe('unchecked calls', () => {
    it.each([
      ['target.call(data);', 'call', 'HIGH'],
      ['target.send(amount);', 'send', 'HIGH'],
      ['target.delegatecall(data);', 'delegatecall', 'CRITICAL'],
      ['target.call{value: amount}(data);', 'call', 'HIGH'],
      ['target.call{gas: 50000, value: amount}(data);', 'call', 'HIGH'],
      ['target.delegatecall{gas: 50000}(data);', 'delegatecall', 'CRITICAL'],
      ['target . call (data);', 'call', 'HIGH'],
      ['payable(target).send(amount);', 'send', 'HIGH'],
    ])('detects %s', async (body, method, severity) => {
      const findings = await analyze(body);

expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        pluginId: 'unchecked-return',
        title: `Unchecked Return Value from address.${method}()`,
        severity,
        filePath: 'Test.sol',
      });
    });

it.each([
      '(bool success, ) = target.call(data);',
      'bool success = target.send(amount);',
      '(bool success, ) = target.delegatecall(data);',
      '(, bytes memory result) = target.call(data);',
      'bool success; (success, ) = target.call(data);',
      'bool success; success = target.send(amount);',
      'bytes memory result; (, result) = target.call(data);',
      'bool success = target.send(amount); emit Result(success);',
      'bool success = target.send(amount); require(amount > 0);',
      'bool success = target.send(amount); require(success || true);',
      'require(amount > 0, string(abi.encode(target.send(amount))));',
    ])('does not confuse assignment or unrelated use with a check: %s', async (body) => {
      expect(await analyze(body)).toHaveLength(1);
    });

it('analyzes each call independently on the same line', async () => {
      const findings = await analyze(
        'require(target.send(amount)); target.send(amount); target.call(data);',
      );

expect(findings).toHaveLength(2);
      expect(findings[0]?.title).toContain('.send()');
      expect(findings[1]?.title).toContain('.call()');
    });

it.each([
      'success = true;',
      'delete success;',
      'if (amount > 0) { success = false; }',
      '{ bool success = true; require(success); }',
      'return;',
      'if (amount > 0) return;',
      'revert("stop");',
    ])('does not accept a later check after invalidation: %s', async (middle) => {
      const findings = await analyze(`
        bool success = target.send(amount);
        ${middle}
        require(success);
      `);

expect(findings).toHaveLength(1);
    });

it('does not use a stale check for a later call', async () => {
      expect(
        await analyze(`
          bool success = true;
          require(success);
          success = target.send(amount);
        `),
      ).toHaveLength(1);
    });

it('does not use a check in another function', async () => {
      const input = `contract Test {
        function first(address payable target) external {
          bool success = target.send(1);
        }
        function second(bool success) external {
          require(success);
        }
      }`;

expect(await plugin.analyze(context(input))).toHaveLength(1);
    });

it('reports multiline source locations and original snippets', async () => {
      const input = `contract Test {
function run(address target) external {
target.call(
  ""
);
}
}`;

const findings = await plugin.analyze(context(input));

expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        lineStart: 3,
        lineEnd: 5,
        codeSnippet: 'target.call(\n  ""\n)',
      });
    });

it('limits long code snippets', async () => {
      const findings = await analyze(`target.call("${'a'.repeat(300)}");`);

expect(findings[0]?.codeSnippet).toHaveLength(200);
    });
  });

describe('handled results', () => {
    it.each([
      'require(target.send(amount));',
      'assert(target.send(amount));',
      'if (!target.send(amount)) { revert("failed"); }',
      'bool success = target.send(amount); require(success);',
      'bool success = target.send(amount); assert(success);',
      'bool success = target.send(amount); require(success == true);',
      'bool success = target.send(amount); require(true == success);',
      'bool success = target.send(amount); require(success != false);',
      'bool success = target.send(amount); if (!success) revert("failed");',
      '(bool success, ) = target.call(data); require(success);',
      '(bool success, ) = target.delegatecall(data); require(success);',
      'bool success; success = target.send(amount); require(success);',
      'bool success; (success, ) = target.call(data); require(success);',
      '(bool success, ) = target.call{value: amount}(data); require(success);',
      `(
        bool success,
        bytes memory result
      ) =
        target.call(data);
      require(success);`,
      `bool success = target.send(amount);
       uint256 unrelated = amount;
       require(success);`,
    ])('accepts %s', async (body) => {
      expect(await analyze(body)).toEqual([]);
    });

it.each([
      ['bool', 'return target.send(amount);'],
      ['bool', 'bool success = target.send(amount); return success;'],
      ['bool, bytes memory', 'return target.call("");'],
      ['bool, bytes memory', 'return target.delegatecall("");'],
    ])('accepts explicit propagation: %s / %s', async (returns, body) => {
      const input = `contract Test {
        function run(address payable target, uint256 amount)
          external returns (${returns})
        {
          ${body}
        }
      }`;

expect(await plugin.analyze(context(input))).toEqual([]);
    });
  });

describe('non-code and unrelated calls', () => {
    it('ignores comments and string literals', async () => {
      expect(
        await analyze(`
          // target.call(data);
          /*
            target.send(amount);
            target.delegatecall(data);
          */
          string memory text = "target.call(data)";
          string memory other = 'target.send(amount)';
        `),
      ).toEqual([]);
    });

it('ignores native transfer and unrelated member names', async () => {
      expect(
        await analyze(`
          target.transfer(amount);
          target.staticcall(data);
          target.callSomething(data);
        `),
      ).toEqual([]);
    });

it('does not include ERC20 transfer in this rule', async () => {
      const input = `interface IERC20 {
        function transfer(address to, uint256 amount) external returns (bool);
      }
      contract Test {
        function run(IERC20 token, address to) external {
          token.transfer(to, 1);
        }
      }`;

expect(await plugin.analyze(context(input))).toEqual([]);
    });
  });

describe('recommendations', () => {
    it.each([
      ['target.call(data);', '(bool success, ) = target.call(data);'],
      [
        'target.send(amount);',
        'bool success = payable(recipient).send(amount);',
      ],
      [
        'target.delegatecall(data);',
        '(bool success, ) = target.delegatecall(data);',
      ],
    ])('provides a valid method-specific pattern for %s', async (body, expected) => {
      const [finding] = await analyze(body);
      if (!finding) throw new Error('Expected an unchecked-return finding');

const fix = plugin.getFixRecommendation(finding);

expect(fix).toContain(expected);
      expect(fix).toContain('require(success,');
      expect(fix).toContain(`Test.sol:${finding.lineStart}`);
      expect(finding.references).toContain(
        'https://swcregistry.io/docs/SWC-104/',
      );

if (body.includes('delegatecall')) {
        expect(fix).not.toContain('delegatecall{value:');
      }
    });
  });
});
