import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

function context(sourceCode: string, overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    contractName: 'Example',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.28',
    metadata: {},
    ...overrides,
  };
}

function contract(body: string): string {
  return `pragma solidity ^0.8.20; contract Example { function run(address payable target, bool flag) external { ${body} } }`;
}

const plugin = new UncheckedReturnPlugin();
const capture = '(bool ok, ) = target.call("");';

describe('UncheckedReturnPlugin', () => {
  it('implements the plugin contract and advertises only supported contexts', async () => {
    await expect(plugin.initialize({})).resolves.toBeUndefined();
    expect(plugin.metadata).toMatchObject({
      id: 'unchecked-return',
      category: 'UNCHECKED_RETURN',
      severity: FindingSeverity.HIGH,
    });
    for (const chain of plugin.metadata.chains)
      expect(plugin.supportsContext(context('', { chain }))).toBe(true);
    expect(plugin.supportsContext(context('', { chain: 'ETHEREUM', language: 'Solidity' }))).toBe(
      true,
    );
    expect(plugin.supportsContext(context('', { chain: 'stellar' }))).toBe(false);
    expect(plugin.supportsContext(context('', { language: 'vyper' }))).toBe(false);
    await expect(
      plugin.analyze(context('target.call("");', { chain: 'stellar' })),
    ).resolves.toEqual([]);
    await expect(plugin.analyze(context(''))).resolves.toEqual([]);
  });

  it.each([
    ['call', 'target.call("");'],
    ['send', 'target.send(1);'],
    ['delegatecall', 'target.delegatecall(data);'],
    ['call', 'target.call{value: amount, gas: gasLimit}(abi.encodeWithSignature("go()"));'],
    ['call', 'target.call.value(1).gas(10000)("");'],
    ['call', capture],
    ['send', 'bool ok = target.send(1);'],
    ['delegatecall', '(bool ok, bytes memory result) = target.delegatecall(data);'],
    ['call', '(, bytes memory data) = target.call("");'],
  ])('finds an ignored %s result: %s', async (method, source) => {
    const findings = await plugin.analyze(context(contract(source)));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain(`.${method}()`);
    expect(findings[0]?.recommendation).toContain('require(success');
    const [finding] = findings;
    if (!finding) throw new Error('Expected a finding');
    expect(plugin.getFixRecommendation(finding)).toContain('transfer()');
  });

  it.each([
    'require(ok);',
    'require(ok, "call failed");',
    'assert(ok);',
    'require((ok));',
    'require(!!ok);',
    'require(ok == true);',
    'require(true == ok);',
    'require(ok != false);',
    'require(false != ok);',
    'require((ok) == (true));',
    'require(ok && flag);',
    'require(flag && ok);',
    'require(ok || false);',
    'require(false || ok);',
    'require(!(ok == false));',
    'if (!ok) revert("failed");',
    'if (!ok) { revert(); }',
    'if (ok) {} else revert();',
    'if (!ok) return;',
    'if (ok) {} else { return; }',
    'if (ok == false) throw;',
    'bool alias = ok; require(alias);',
    'bool failed = !ok; if (failed) revert();',
    'if (flag) require(ok); else assert(ok);',
    'if (flag) { require(ok); } require(ok);',
    'if (true) require(ok);',
    'if (false) {} else require(ok);',
    'if (ok || flag) { require(ok); } else revert();',
    'revert("unconditional rollback");',
    'bool okAlias; require(okAlias);',
    'unchecked { require(ok); }',
  ])('recognises a supported success/failure check: %s', async (check) => {
    await expect(plugin.analyze(context(contract(`${capture} ${check}`)))).resolves.toEqual([]);
  });

  it.each([
    'require(!ok);',
    'require(ok == false);',
    'require(ok != true);',
    'require(ok == trueFlag);',
    'require(untrue == ok);',
    'require(ok != falseFlag);',
    'require(ok || flag);',
    'require(flag || ok);',
    'require(ok || true);',
    'require(true || ok);',
    'require("ok");',
    'require(otherOk);',
    'if (ok) emit Done();',
    'if (!ok) emit Failed();',
    'if (flag) require(ok);',
    'if (flag) { require(ok); } else emit Other();',
    'if (false) require(ok);',
    'if (!ok && flag) return;',
    'if (ok || true) return;',
    'if (!ok) {} return;',
    'return;',
    'return ok;',
    'ok = true; require(ok);',
    'ok = flag; require(ok);',
    'ok &= flag; require(ok);',
    'delete ok; require(!ok);',
    '{ bool ok = true; require(ok); }',
    'bool okAlias = true; require(okAlias);',
    'require((ok = true)); require(ok);',
    'if ((ok = true)) require(ok);',
    'helper(ok = true); require(ok);',
    'assembly { ok := 1 } require(ok);',
    'try helper() { require(ok); } catch { }',
  ])('does not accept an ineffective or optional check: %s', async (check) => {
    const findings = await plugin.analyze(context(contract(`${capture} ${check}`)));
    expect(findings).toHaveLength(1);
  });

  it.each([
    'require(target.send(1));',
    'assert(target.send(1));',
    'if (!target.send(1)) revert();',
    'if (target.send(1)) {} else return;',
    'require(target.send(1) && target.send(2));',
    'if (!target.send(1) || !target.send(2)) revert();',
    'require(true || target.send(1));',
    'bool unused = false && target.send(1);',
    'target.transfer(1);',
    'token.transfer(recipient, 1);',
    'target.staticcall(data);',
    'target.callback();',
    'if (false) target.call("");',
    'while (false) { target.call(""); }',
    'for (; false;) { target.send(1); }',
    'revert(); target.send(1);',
    'do { return; } while (target.send(1));',
  ])('respects inline checks, exclusions and unreachable code: %s', async (body) => {
    await expect(plugin.analyze(context(contract(body)))).resolves.toEqual([]);
  });

  it.each([
    'require(target.send(1) || true);',
    'require(check(target.send(1)));',
    'if (target.send(1)) emit Done();',
    'bool success = helper(target.send(1)); require(success);',
    'while (target.send(1)) {}',
  ])('does not hide a call in unsupported or failure-allowing expressions: %s', async (body) => {
    expect(await plugin.analyze(context(contract(body)))).toHaveLength(1);
  });

  it('tracks results independently after overwrite and across functions', async () => {
    const source = `contract Example {
      function one() external { (bool ok,) = a.call(""); (ok,) = b.delegatecall(""); require(ok); }
      function two() external { bool ok = a.send(1); }
      function unrelated() external { bool ok = true; require(ok); }
    }`;
    const findings = await plugin.analyze(context(source));
    expect(findings.map((finding) => finding.title)).toEqual([
      'Unchecked .call() return value',
      'Unchecked .send() return value',
    ]);
  });

  it('retains the correct outer binding across nested shadowing', async () => {
    await expect(
      plugin.analyze(context(contract(`${capture} { bool ok = false; } require(ok);`))),
    ).resolves.toEqual([]);
    expect(
      await plugin.analyze(context(contract(`${capture} { ok = true; } require(ok);`))),
    ).toHaveLength(1);
  });

  it('does not treat string/comment text as calls, guards or delimiters', async () => {
    const source = String.raw`contract Example {
      // target.send(1); function fake() { }
      /* target.delegatecall(data); } require(ok); */
      string constant bait = "target.call(\"\"); { require(success); }";
      function real() external {
        (bool ok,) = target.call("");
        string memory text = "require(ok);";
        // require(ok);
      }
    }`;
    const findings = await plugin.analyze(context(source));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(6);
    expect(findings[0]?.codeSnippet).toBe('(bool ok,) = target.call("");');
  });

  it('reports each call on a shared line and accurate multiline locations', async () => {
    const findings = await plugin.analyze(
      context(
        `contract C {\nfunction f() external {\n a.send(1); b.send(2);\n target.call{\n value: amount\n }(\n data\n );\n}\n}`,
        { contractName: 'C.sol' },
      ),
    );
    expect(findings).toHaveLength(3);
    expect(findings.map((finding) => [finding.lineStart, finding.lineEnd])).toEqual([
      [3, 3],
      [3, 3],
      [4, 8],
    ]);
    expect(findings[2]?.filePath).toBe('C.sol');
    expect(findings[2]?.codeSnippet).toContain('value: amount');
  });

  it.each([
    'for (uint i = 0; i < n; i++) { (bool ok,) = a.call(""); require(ok); }',
    'while (flag) { bool ok = a.send(1); if (!ok) break; }',
    'while (flag) { bool ok = a.send(1); if (!ok) continue; }',
    'do { bool ok = a.send(1); require(ok); } while (flag);',
    `${capture} while (flag) {} require(ok);`,
    `${capture} for (;;) { require(ok); break; }`,
    'bool ok; do { (ok,) = a.call(""); } while (false); require(ok);',
    'bool ok; for ((ok,) = a.call(""); flag;) {} require(ok);',
    'bool ok; for (; flag; require(ok)) { (ok,) = a.call(""); }',
    'for (require(false); flag;) { a.call(""); }',
  ])('accepts checks covering the reachable loop paths: %s', async (body) => {
    await expect(plugin.analyze(context(contract(body)))).resolves.toEqual([]);
  });

  it.each([
    'for (uint i=0; i<n; i++) { a.call(""); }',
    'bool ok; for (uint i=0; i<n; i++) { (ok,) = a.call(""); } require(ok);',
    'while (flag) { (bool ok,) = a.call(""); if (flag2) continue; require(ok); }',
    'while (flag) { (bool ok,) = a.call(""); if (flag2) break; require(ok); }',
    `${capture} while (flag) { require(ok); }`,
    'do { a.send(1); } while (false);',
  ])('finds unchecked iteration or zero-iteration paths: %s', async (body) => {
    expect(await plugin.analyze(context(contract(body)))).toHaveLength(1);
  });

  it('analyses constructor, fallback, receive, modifier and free functions separately', async () => {
    const source = `function free() { a.send(1); }
      contract C { constructor() { a.send(1); } fallback() external { a.call(""); }
      receive() external payable { a.delegatecall(""); } modifier check() { a.send(1); _; }
      function signatureOnly() external; }`;
    expect(await plugin.analyze(context(source))).toHaveLength(5);
  });

  it('is reusable without findings leaking between analyses', async () => {
    expect(await plugin.analyze(context(contract('a.send(1);')))).toHaveLength(1);
    await expect(plugin.analyze(context(contract('require(a.send(1));')))).resolves.toEqual([]);
  });

  it('analyses the compiler-valid acceptance fixture', async () => {
    const source = readFileSync(join(__dirname, 'fixtures', 'acceptance.sol'), 'utf8');
    const findings = await plugin.analyze(
      context(source, { contractName: 'AcceptanceExamples.sol' }),
    );
    expect(findings).toHaveLength(6);
    expect(findings.map((finding) => finding.lineStart)).toEqual([7, 11, 15, 19, 25, 30]);
    expect(findings.every((finding) => finding.filePath === 'AcceptanceExamples.sol')).toBe(true);
  });

  it('covers compiler-valid review regressions without flagging their safe controls', async () => {
    const source = readFileSync(join(__dirname, 'fixtures', 'review-regressions.sol'), 'utf8');
    const findings = await plugin.analyze(context(source));
    expect(findings).toHaveLength(6);
    expect(findings.map((finding) => finding.lineStart)).toEqual([14, 22, 31, 34, 50, 59]);
  });

  it.each([
    'for (bool first = true; ; first = false) { if (!first) { target.send(1); break; } }',
    'for (bool first = true; ; first = false) { bool ok = target.send(1); if (first) require(ok); else break; }',
  ])('checks later abstract loop iterations: %s', async (body) => {
    expect(await plugin.analyze(context(contract(body)))).toHaveLength(1);
  });

  it('invalidates storage bindings across helper calls', async () => {
    const source =
      'contract C { bool gate; function flip() internal { gate=false; } function f(address payable target) external { gate=true; flip(); if(!gate) { target.send(1); } } }';
    expect(await plugin.analyze(context(source))).toHaveLength(1);
  });

  it('retains primitive locals and parameters across helper calls', async () => {
    const local =
      'contract C { function helper() internal {} function f(address target) external { (bool ok,) = target.call(""); helper(); require(ok); } }';
    const parameter =
      'contract C { bool gate; function flip() internal { gate=false; } function f(address payable target, bool gate) external { gate=true; flip(); if(!gate) target.send(1); } }';
    await expect(plugin.analyze(context(local))).resolves.toEqual([]);
    await expect(plugin.analyze(context(parameter))).resolves.toEqual([]);
  });

  it('does not accept a success flag stored in mutable state after a helper overwrites it', async () => {
    const source =
      'contract C { bool ok; function overwrite() internal { ok=true; } function f(address target) external { (ok,) = target.call(""); overwrite(); require(ok); } }';
    expect(await plugin.analyze(context(source))).toHaveLength(1);
  });

  it('does not turn require(!success) into a failure-handling return', async () => {
    expect(
      await plugin.analyze(context(contract(`${capture} require(!ok); return;`))),
    ).toHaveLength(1);
  });

  it('does not let a tautological condition excuse an already-known failure', async () => {
    const source = `${capture} if (!ok) {} if (!ok || true) return;`;
    expect(await plugin.analyze(context(contract(source)))).toHaveLength(1);
  });

  it.each([
    'contract C { modifier ignore(bool value) { _; } function f(address payable target) external ignore(target.send(1)) {} }',
    'contract B { constructor(bool value) {} } contract C is B { constructor(address payable target) B(target.send(1)) {} }',
    'contract C { bool value = payable(address(1)).send(1); function f() external {} }',
  ])('includes executable headers and initializers: %s', async (source) => {
    expect(await plugin.analyze(context(source))).toHaveLength(1);
  });

  it.each([
    'bool ok; if (flag && (ok = target.send(1))) {} else return;',
    `${capture} if (!ok && flag) revert(); if (!ok && !flag) revert();`,
    `${capture} require((ok || flag) && (ok || !flag));`,
  ])('preserves short-circuit and disjunctive guard paths: %s', async (body) => {
    await expect(plugin.analyze(context(contract(body)))).resolves.toEqual([]);
  });

  it('preserves named return locals across helper calls', async () => {
    const source =
      'contract C { function helper() internal {} function f(address target) external returns (bool ok) { (ok,) = target.call(""); helper(); require(ok); } }';
    await expect(plugin.analyze(context(source))).resolves.toEqual([]);
  });

  it.each([
    '(flag && (ok = target.send(1))) == true',
    'true == (flag && (ok = target.send(1)))',
    '(flag && (ok = target.send(1))) != false',
    'false != (flag && (ok = target.send(1)))',
    '(flag && (ok = target.send(1))) == (true)',
  ])('preserves short-circuit effects inside a literal comparison: %s', async (condition) => {
    await expect(
      plugin.analyze(context(contract(`bool ok; if (${condition}) {} else return;`))),
    ).resolves.toEqual([]);
  });

  it('does not widen a loop binding reassigned to the same constant', async () => {
    const source =
      'bool keep = true; for (bool first = true;; first = false) { if (!keep) target.send(1); keep = true; if (!first) break; }';
    await expect(plugin.analyze(context(contract(source)))).resolves.toEqual([]);
  });

  it('invalidates storage hidden by a shadowing local across a helper call', async () => {
    const source =
      'contract C { bool ok; function overwrite() internal { ok = true; } function f(address target) external { (ok,) = target.call(""); { bool ok = false; overwrite(); } require(ok); } }';
    expect(await plugin.analyze(context(source))).toHaveLength(1);
  });

  it('preserves an outer local hidden by another local across a helper call', async () => {
    const source =
      'contract C { function helper() internal {} function f(address target) external { (bool ok,) = target.call(""); { bool ok = false; helper(); } require(ok); } }';
    await expect(plugin.analyze(context(source))).resolves.toEqual([]);
  });

  it('distinguishes mutable storage from the compiler-valid safe guard regressions', async () => {
    const source = readFileSync(join(__dirname, 'fixtures', 'guard-regressions.sol'), 'utf8');
    const findings = await plugin.analyze(context(source));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(17);
    expect(findings[0]?.confidence).toBe(0.7);
  });
});
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
