import { PluginRegistry } from '@veridion/scanner-core';
import type { AnalysisContext } from '@veridion/scanner-types';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

const plugin = new UncheckedReturnPlugin();
const context = (body: string): AnalysisContext => ({
  contractName: 'Example',
  sourceCode: `contract Example { function run(address payable target) external { ${body} } }`,
  chain: 'ethereum',
  language: 'solidity',
  compilerVersion: '0.8.20',
  metadata: {},
});

// These snippets exercise source analysis only; they are never deployed or executed.
describe('UncheckedReturnPlugin', () => {
  it.each([
    'target.call("");',
    'target.send(1);',
    'target.delegatecall(data);',
    'target.staticcall(data);',
    'target.call{value: 1, gas: 5000}(abi.encode(a, b));',
    'target.call.value(1).gas(5000)(data);',
    'target.call.gas(5000).value(1)(data);',
    'address(target).call(data);',
    'targets[0].send(1);',
    'wallet.target.send(1);',
    '(bool ok, ) = target.call(data);',
    '(, bytes memory data) = target.call("");',
    'bool ok = target.send(1);',
    '(bool ok, ) = target.call(data); require(other);',
    '(bool ok, ) = target.call(data); require(ok == trueFlag);',
    '(bool ok, ) = target.call(data); require(untrue == ok);',
    '(bool ok, ) = target.call(data); require(ok || allowed);',
    '(bool ok, ) = target.call(data); require(!ok);',
    '(bool ok, ) = target.call(data); if (allowed) { require(ok); }',
    '(bool ok, ) = target.call(data); ok = true; require(ok);',
    '(bool ok, ) = target.call(data); } function other() public { require(ok);',
    '(bool ok, ) = target.call(data); if (!ok) { emit Failed(); }',
    'bool ok = !target.send(1); require(ok);',
    'require(wrapper(target.send(1)));',
    'emit Sent(target.send(1));',
    'if (allowed) target.send(1);',
    'require(target.send(1) || allowed);',
    'require(target.send(1) == trueFlag);',
    'target /* comment */ . call ( data );',
    '((boolOk, bytesData) = target.call(data));',
  ])('reports an unrecognized or missing check: %s', async (body) => {
    const findings = await plugin.analyze(context(body));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.recommendation).toContain('require(success');
  });

  it.each([
    '',
    'target.transfer(1);',
    '// target.call(data);\n',
    '/* target.send(1); */',
    'string memory note = "target.call(data);";',
    "string memory note = 'target.send(1);';",
    String.raw`string memory note = "escaped \" target.call(data);";`,
    'require(target.send(1));',
    'assert(target.send(1));',
    'require(payable(target).send(1), "failed");',
    'require(target.send(1) == true);',
    'if (!target.send(1)) revert Failed();',
    'if (target.send(1) == false) { revert(); }',
    '(bool ok, ) = target.call(data); require(ok);',
    '(bool ok, bytes memory data) = target.delegatecall(data); require(ok, "failed");',
    '(ok, ) = target.staticcall(data); assert(ok);',
    'bool ok = target.send(1); require(ok);',
    'ok = target.send(1); require(ok);',
    '(bool ok, ) = target.call{value: 1}(data); require(ok);',
    '(bool ok, ) = target.call(data); require(((ok)));',
    '(bool ok, ) = target.call(data); require(ok == true);',
    '(bool ok, ) = target.call(data); require(true == ok);',
    '(bool ok, ) = target.call(data); require(ok != false);',
    '(bool ok, ) = target.call(data); require(false != ok);',
    '(bool ok, ) = target.call(data); if (!ok) revert Failed();',
    '(bool ok, ) = target.call(data); if (ok == false) { revert("failed"); }',
    '(bool ok, ) = target.call(data); return ok;',
    'return target.call(data);',
    'return target.send(1);',
    'target.call;',
    'call(data);',
  ])('leaves checked, forwarded, or unrelated code alone: %s', async (body) => {
    expect(await plugin.analyze(context(body))).toEqual([]);
  });

  it('preserves source locations across comments and multiline call options', async () => {
    const input = context('');
    input.sourceCode =
      '/* intro\n comment */\ncontract Example {\nfunction run() external {\n  target.call{\n    value: 1\n  }(data);\n}\n}';
    const [finding] = await plugin.analyze(input);
    expect(finding).toMatchObject({
      pluginId: 'unchecked-return',
      severity: 'MEDIUM',
      filePath: 'Example.sol',
      lineStart: 5,
      lineEnd: 7,
      codeSnippet: 'target.call{\n    value: 1\n  }(data)',
    });
    expect(finding && plugin.getFixRecommendation(finding)).toContain('require(success');
  });

  it('does not share checks between calls or between analyses', async () => {
    const input = context('target.call(data); (bool ok, ) = target.call(data); require(ok);');
    expect(await plugin.analyze(input)).toHaveLength(1);
    expect(await plugin.analyze(input)).toHaveLength(1);
    expect(await plugin.analyze(context('target.send(1); target.call(data);'))).toHaveLength(2);
  });

  it.each(['target.call(', 'target.call{value: 1', 'target.call.value(', '/* unfinished'])(
    'handles incomplete source: %s',
    async (body) => {
      await expect(plugin.analyze({ ...context(''), sourceCode: body })).resolves.toEqual([]);
    },
  );

  it('supports only declared chains and Solidity', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
    expect(plugin.supportsContext(context(''))).toBe(true);
    for (const input of [
      { ...context('target.send(1);'), chain: 'stellar' },
      { ...context('target.send(1);'), language: 'rust' },
    ]) {
      expect(plugin.supportsContext(input)).toBe(false);
      expect(await plugin.analyze(input)).toEqual([]);
    }
  });

  it('registers and runs through the existing registry', async () => {
    const registry = new PluginRegistry();
    registry.register(plugin);
    expect(registry.getByCategory('UNCHECKED_RETURN')).toEqual([plugin]);
    const [registered] = registry.getMatchingPlugins(context(''));
    expect(registered).toBe(plugin);
    expect(await registered?.analyze(context('target.send(1);'))).toHaveLength(1);
  });
});
