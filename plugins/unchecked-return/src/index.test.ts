import { FindingSeverity } from '@veridion/shared';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

function ctx(
  sourceCode: string,
  contractName = 'Test',
): Parameters<UncheckedReturnPlugin['analyze']>[0] {
  return {
    contractName,
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.19',
    metadata: {},
  };
}

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  // ──── metadata ────────────────────────────────────────────────────────────

  it('should expose correct metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.name).toBe('Unchecked Low-Level Call Return Value Detector');
    expect(plugin.metadata.version).toBe('1.0.0');
    expect(plugin.metadata.severity).toBe('MEDIUM');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
    expect(plugin.metadata.languages).toEqual(['solidity']);
    expect(plugin.metadata.chains).toContain('ethereum');
    expect(plugin.metadata.references?.length).toBeGreaterThan(0);
  });

  // ──── supportsContext ─────────────────────────────────────────────────────

  it('should support solidity on ethereum', () => {
    expect(plugin.supportsContext(ctx(''))).toBe(true);
  });

  it('should not support vyper', () => {
    expect(plugin.supportsContext({ ...ctx(''), language: 'vyper' })).toBe(false);
  });

  it('should not support unsupported chains', () => {
    expect(plugin.supportsContext({ ...ctx(''), chain: 'solana' })).toBe(false);
  });

  it('should not support unsupported languages', () => {
    expect(plugin.supportsContext({ ...ctx(''), language: 'rust' })).toBe(false);
  });

  // ──── positive: standalone calls ─────────────────────────────────────────

  it('should detect unchecked .call()', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.pluginId).toBe('unchecked-return');
    expect(findings[0]?.description).toContain('.call()');
    expect(findings[0]?.codeSnippet).toContain('a.call');
    expect(findings[0]?.lineStart).toBe(3);
    expect(findings[0]?.filePath).toBe('V.sol');
  });

  it('should detect unchecked .call() with value braces', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    a.call{value: address(this).balance}("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.description).toContain('.call()');
  });

  it('should detect unchecked .send()', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    a.send(1 ether);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.description).toContain('.send()');
  });

  it('should detect unchecked .delegatecall()', async () => {
    const code = [
      'contract V {',
      '  function f(address a, bytes calldata d) public {',
      '    a.delegatecall(d);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.description).toContain('.delegatecall()');
  });

  it('should detect unchecked .delegatecall() with gas braces', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    a.delegatecall{gas: 100000}(abi.encodeWithSignature("f()"));',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should detect .call() on complex receiver expressions', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    payable(a).call{value: 1}("");',
      '    address(this).call("");',
      '    getAddr().call("");',
      '  }',
      '  function getAddr() internal pure returns (address) { return address(0); }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(3);
  });

  // ──── positive: captured but never checked ───────────────────────────────

  it('should detect captured-but-unused tuple return value', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    (bool success, ) = a.call("");',
      '    // success is never checked',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.description).toContain('success');
  });

  it('should detect captured-but-unused multi-element tuple', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    (bool success, bytes memory ret) = a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should detect captured-but-unused single-variable send', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    bool sent = a.send(1 ether);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.description).toContain('sent');
  });

  it('should detect later re-assignment that is never checked', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    bool sent;',
      '    sent = a.send(1 ether);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should detect capture in a plain (pre-declared) tuple', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    bool success;',
      '    (success, ) = a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a call whose captured value is only read inside a non-halting if', async () => {
    const code = [
      'contract V {',
      '  event Done(bool ok);',
      '  function f(address a) public {',
      '    (bool success, ) = a.call("");',
      '    if (success) { emit Done(success); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  // ──── safe patterns ──────────────────────────────────────────────────────

  it('should not flag require(success)', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public payable {',
      '    (bool success, ) = a.call{value: msg.value}("");',
      '    require(success);',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag require(success, "msg")', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    (bool success, ) = a.call("");',
      '    require(success, "call failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag assert(success)', async () => {
    const code = [
      'contract S {',
      '  function f(address a) public {',
      '    (bool success, ) = a.delegatecall("");',
      '    assert(success);',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag if (!success) revert()', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    (bool success, ) = a.call("");',
      '    if (!success) revert("failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag if (!success) { revert(...); }', async () => {
    const code = [
      'contract S {',
      '  function f(address a) public {',
      '    (bool success, ) = a.call("");',
      '    if (!success) {',
      '      revert("failed");',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag if (!success) return;', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    (bool success, ) = a.call{value: 1}("");',
      '    if (!success) return;',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag else-branch revert of if (success)', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    (bool success, ) = a.call("");',
      '    if (success) {',
      '      a.transfer(1);',
      '    } else {',
      '      revert("failed");',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag inline require(target.send(...))', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    require(a.send(1 ether), "send failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag inline assert(target.send(...))', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    assert(a.send(1));',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag inline if (!target.send(...)) revert()', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    if (!a.send(1 ether)) revert("failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag inline if-condition call whose body does not halt', async () => {
    const code = [
      'contract V {',
      '  event Sent(bool ok);',
      '  function f(address payable a) public {',
      '    if (a.send(1 ether)) { emit Sent(true); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should not flag require on a value AND-ed with the captured variable', async () => {
    const code = [
      'contract S {',
      '  bool public allowed = true;',
      '  function f(address payable a) public {',
      '    (bool sent, ) = a.call("");',
      '    require(sent && allowed, "no");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should handle guard-then-reuse of the same variable name (LIFO)', async () => {
    const code = [
      'contract V {',
      '  function f(address a1, address a2) public {',
      '    (bool ok, ) = a1.call("");',
      '    require(ok, "first");',
      '    (bool ok2, ) = a2.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.codeSnippet).toContain('ok2');
  });

  // ──── scope isolation ────────────────────────────────────────────────────

  it('should NOT treat a require in another function as a check (cross-function)', async () => {
    const code = [
      'contract V {',
      '  function a(address t) public {',
      '    (bool ok, ) = t.call("");',
      '  }',
      '  function b(address t) public {',
      '    (bool ok, ) = t.call("");',
      '    require(ok, "b checked");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(3); // fn `a`'s call; fn `b`'s is guarded
    expect(findings[0]?.codeSnippet).toContain('t.call');
  });

  it('should flag each function independently (check in function b does not clear a)', async () => {
    const code = [
      'contract V {',
      '  function a(address payable t) public {',
      '    bool sent = t.send(1);',
      '  }',
      '  function b(address payable t) public {',
      '    bool sent = t.send(2);',
      '    require(sent);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.codeSnippet).toContain('t.send(1)');
  });

  it('should flag a call whose guard appears BEFORE the assignment', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    bool sent;',
      '    require(sent, "nothing yet");',
      '    sent = a.send(1);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag calls inside constructors and modifiers independently', async () => {
    const code = [
      'contract V {',
      '  address owner;',
      '  constructor(address a) {',
      '    (bool ok, ) = a.call("");',
      '  }',
      '  modifier m(address a) {',
      '    (bool ok, ) = a.call("");',
      '    _;',
      '  }',
      '  function f(address payable a) public {',
      '    (bool ok, ) = a.call("");',
      '    require(ok);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(2);
  });

  it('should treat an unrelated require of a differently-named variable as not-a-check', async () => {
    const code = [
      'contract V {',
      '  bool public successfulOrder = false;',
      '  function f(address payable a) public {',
      '    (bool success, ) = a.call("");',
      '    require(successfulOrder, "order");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  // ──── naming collisions / lookalikes ─────────────────────────────────────

  it('should not flag lookalike function names', async () => {
    const code = [
      'contract Other {',
      '  function callSomething(bytes memory) external {}',
      '  function callback() external {}',
      '  function sendMessage(string calldata) external {}',
      '}',
      'interface I {',
      '  function call(bytes memory data) external returns (bool);',
      '  function f(uint256 x) external;',
      '}',
      'contract V {',
      '  function test(Other o, I i) public {',
      '    o.callSomething("x");',
      '    o.callback();',
      '    bytes memory data = abi.encodeCall(I.f, (1));',
      '    i.call(data); // interface member function named call -> flagged by design',
      '    o.sendMessage("hi");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    // `i.call(data)` is a member call named exactly `call` -> detected by design
    expect(findings).toHaveLength(1);
    expect(findings[0]?.codeSnippet).toContain('i.call(data)');
  });

  it('should not flag function declarations named call/send', async () => {
    const code = [
      'interface I {',
      '  function call(bytes calldata data) external returns (bool);',
      '  function send(uint256 amount) external returns (bool);',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'I'))).toHaveLength(0);
  });

  // ──── comments & strings ─────────────────────────────────────────────────

  it('should ignore call-like text in line and block comments', async () => {
    const code = [
      'contract V {',
      '  // a.call("") -- commented out',
      '  /* (bool ok, ) = b.delegatecall(""); require(ok); */',
      '  function f(address a) public {',
      '    /* if (!a.send(1)) revert(); */',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'V'))).toHaveLength(0);
  });

  it('should not treat a commented-out require as a check', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    // TODO: require(ok, "later")',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should ignore call-like text inside string literals', async () => {
    const code = [
      'contract V {',
      '  string constant TIP = "remember: a.call(\\"\\") returns (bool, bytes)";',
      '  string constant TIP2 = "use require(success)";',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  // ──── transfer semantics ─────────────────────────────────────────────────

  it('should never flag address.transfer() (it reverts; returns no boolean)', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    a.transfer(1 ether);',
      '    payable(msg.sender).transfer(2 ether);',
      '    (bool success, ) = a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    // only the .call() is flagged; both transfers are ignored by design
    expect(findings).toHaveLength(1);
    expect(findings[0]?.codeSnippet).toContain('a.call');
  });

  it('should not flag ERC20-style transfer (separate rule; needs type info)', async () => {
    const code = [
      'contract V {',
      '  function f(IERC20 token, address to) public {',
      '    token.transfer(to, 100);',
      '  }',
      '}',
      'interface IERC20 { function transfer(address, uint256) external returns (bool); }',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'V'))).toHaveLength(0);
  });

  it('should not flag transfer inside an otherwise safe flow', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    a.transfer(1 ether);',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'V'))).toHaveLength(0);
  });

  // ──── formatting & structure ─────────────────────────────────────────────

  it('should handle multi-line call statements', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    (bool success, ) = a.call{',
      '      value: 1 ether',
      '    }("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should detect every call when several appear in one function', async () => {
    const code = [
      'contract V {',
      '  function f(address a, address payable b) public {',
      '    a.call("");',
      '    b.send(1);',
      '    a.delegatecall("");',
      '    (bool ok, ) = a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(4);
  });

  it('should detect two calls on the same line', async () => {
    const code = [
      'contract V {',
      '  function f(address a, address b) public {',
      '    a.call(""); b.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(2);
  });

  it('should not flag a guarded call after an unrelated standalone call', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    a.call("");',
      '    (bool ok, ) = a.call("");',
      '    require(ok);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(3);
  });

  it('should handle whitespace-tolerant member access', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    a . call { value: 1 } ( "" ) ;',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should handle CRLF line endings', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    require(ok);',
      '  }',
      '}',
    ].join('\r\n');
    expect(await plugin.analyze(ctx(code, 'V'))).toHaveLength(0);
  });

  it('should handle empty source and empty contracts', async () => {
    expect(await plugin.analyze(ctx(''))).toHaveLength(0);
    expect(await plugin.analyze(ctx('contract Empty {}'))).toHaveLength(0);
    expect(await plugin.analyze(ctx('pragma solidity ^0.8.0;'))).toHaveLength(0);
  });

  it('should analyze multiple contracts in one source independently', async () => {
    const code = [
      'contract Safe {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    require(ok);',
      '  }',
      '}',
      'contract Bad {',
      '  function g(address a) public {',
      '    a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'SafeAndBad'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.codeSnippet).toContain('a.call');
    expect(findings[0]?.filePath).toBe('SafeAndBad.sol');
  });

  it('should report a state-boolean written in one function and required in another', async () => {
    // cross-function state flow cannot be proven textually -> conservative report
    const code = [
      'contract V {',
      '  bool public paid;',
      '  function pay(address payable a) public {',
      '    paid = a.send(1);',
      '  }',
      '  function claim() public {',
      '    require(paid, "not paid");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  // ──── finding structure / interface ──────────────────────────────────────

  it('should populate finding fields correctly', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    a.call("");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    const finding = findings[0];
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('MEDIUM');
    expect(finding?.lineEnd).toBe(finding?.lineStart);
    expect(finding?.confidence).toBeGreaterThan(0);
    expect(finding?.confidence).toBeLessThanOrEqual(1);
    expect(finding?.references.length).toBeGreaterThan(0);
    expect(finding?.recommendation.length).toBeGreaterThan(10);
  });

  it('should provide a fix recommendation mentioning require(success)', () => {
    const finding = {
      pluginId: 'unchecked-return',
      title: 'Unchecked Low-Level Call Return Value',
      description: '',
      severity: FindingSeverity.MEDIUM,
      filePath: 'Test.sol',
      lineStart: 3,
      lineEnd: 3,
      codeSnippet: 'a.call("");',
      recommendation: '',
      confidence: 0.9,
      references: [],
    };
    const fix = plugin.getFixRecommendation(finding);
    expect(fix).toContain('require(success)');
    expect(fix).toContain('Test.sol:3');
    // transfer guidance stays accurate inside the fix text
    expect(fix).toContain('.transfer()');
  });

  it('should initialize without error', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
  });

  // ──── guard polarity (Codex audit round 1: MEDIUMs) ─────────────────────

  it('should flag if (ok) revert() — a success-only halt does not guard failure', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    if (ok) revert("never");',
      '    // failure of the call falls through silently',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag require(!ok) after a call', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1);',
      '    require(!ok, "send succeeded?");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag require(ok || allowFailure)', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool allowFailure) public {',
      '    bool ok = a.send(1);',
      '    require(ok || allowFailure, "failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a captured value overwritten before its guard', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1);',
      '    ok = true;',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(3);
  });

  it('should not flag require(ok == true)', async () => {
    const code = [
      'contract S {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    require(ok == true, "failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag inline if (a.send(1)) revert() — failure falls through', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    if (a.send(1)) revert("never");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should keep flagging when a guard overwritten variable is reused by a later capture', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1);',
      '    ok = a.send(2);',
      '    require(ok, "second checked");',
      '  }',
      '}',
    ].join('\n');
    // first send's result was overwritten before any guard; second is guarded
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.codeSnippet).toContain('a.send(1)');
  });

  // ──── Codex audit round 2 ────────────────────────────────────────────────

  it('should flag require(a.send(...) || allowFailure) — OR lets failure through', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool allowFailure) public {',
      '    require(a.send(1 ether) || allowFailure, "failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag if (!a.send(...) && emergency) revert() — compound negation is not a guarantee', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool emergency) public {',
      '    if (!a.send(1 ether) && emergency) revert("x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag when the only halt is nested inside another conditional', async () => {
    const code = [
      'contract V {',
      '  function f(address a, bool emergency) public {',
      '    (bool ok, ) = a.call("");',
      '    if (!ok) {',
      '      if (emergency) revert("x");',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should detect legacy pre-0.5 .call.value(...)(...) syntax', async () => {
    const code = [
      'pragma solidity 0.4.26;',
      'contract V {',
      '  function f(address a) public {',
      '    a.call.value(1 ether)();',
      '    a.call.gas(100000)();',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(2);
  });

  it('should treat legacy .call.value(...) captures as checkable', async () => {
    const code = [
      'pragma solidity 0.4.26;',
      'contract S {',
      '  function f(address a) public {',
      '    bool ok = a.call.value(1 ether)();',
      '    require(ok, "failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag a tuple assignment that overwrites a pending capture', async () => {
    const code = [
      'contract V {',
      '  function status() internal pure returns (bool, bool) { return (true, true); }',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    (ok, ignored) = status();',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.codeSnippet).toContain('a.call');
  });

  it('should not flag require(!!ok) — double negation is a positive requirement', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1);',
      '    require(!!ok, "failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  // ──── Codex audit round 3 ────────────────────────────────────────────────

  it('should flag require(allowFailure == ok) — equality can hold when ok is false', async () => {
    const code = [
      'contract V {',
      '  function f(address a, bool allowFailure) public {',
      '    (bool ok, ) = a.call("");',
      '    require(allowFailure == ok, "failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag if (ok || allowFailure) work(); else revert(); — OR bypasses the guard', async () => {
    const code = [
      'contract V {',
      '  event Done();',
      '  function f(address a, bool allowFailure) public {',
      '    (bool ok, ) = a.call("");',
      '    if (ok || allowFailure) { emit Done(); }',
      '    else { revert("failed"); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag require(a.send(1) ? true : allowFailure) — ternary wrapper', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool allowFailure) public {',
      '    require(a.send(1) ? true : allowFailure, "failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should not flag require((a || b) && ok) — an ok term satisfies the conjunction', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a, bool x, bool y) public {',
      '    bool ok = a.send(1);',
      '    require((x || y) && ok, "failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag if (!(ok)) revert() — parenthesised negation', async () => {
    const code = [
      'contract S {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    if (!(ok)) revert("failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag a capture flipped by `ok = !ok` before its guard', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool other) public {',
      '    bool ok = a.send(1);',
      '    ok = !ok;',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag compound assignments to a pending capture', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool other) public {',
      '    bool ok = a.send(1);',
      '    ok |= other;',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should detect legacy option calls with nested argument expressions', async () => {
    const code = [
      'pragma solidity 0.4.26;',
      'contract V {',
      '  function f(address a) public {',
      '    a.call.value(address(this).balance)();',
      '    a.call.gas(gasleft())();',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(2);
  });

  // ──── Codex audit round 4 ────────────────────────────────────────────────

  it('should flag require(a.send(1) == false) — failure satisfies the require', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    require(a.send(1 ether) == false, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag require(a.send(1) != true)', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    require(a.send(1 ether) != true, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should not flag require(a.send(1) == true) — success required', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    require(a.send(1 ether) == true, "x");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag if (!invert(a.send(1))) revert() — function wrapper around the call', async () => {
    const code = [
      'contract V {',
      '  function invert(bool x) internal pure returns (bool) { return !x; }',
      '  function f(address payable a) public {',
      '    if (!invert(a.send(1 ether))) revert("x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should not flag require(!(!ok)) — parenthesised double negation', async () => {
    const code = [
      'contract S {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    require(!(!ok), "x");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag require(true == ok)', async () => {
    const code = [
      'contract S {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    require(true == ok, "x");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag require(false == ok) — failure passes the require', async () => {
    const code = [
      'contract V {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    require(false == ok, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should not treat struct member writes as overwrites of a local capture', async () => {
    const code = [
      'contract S {',
      '  struct S { bool ok; }',
      '  S public s;',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    s.ok = true;',
      '    s . ok = true;',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should still flag a genuine local overwrite after member writes', async () => {
    const code = [
      'contract V {',
      '  struct S { bool ok; }',
      '  S public s;',
      '  mapping(uint256 => bool) public m;',
      '  function f(address a, uint256 k) public {',
      '    (bool ok, ) = a.call("");',
      '    s.ok = true;',
      '    m[k] = true;',
      '    ok = false;',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should not flag tuple assignments to struct members', async () => {
    const code = [
      'contract S {',
      '  struct Pair { bool ok; bool other; }',
      '  Pair public p;',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    (p.ok, p.other) = (true, true);',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  // ──── Codex audit round 5 ────────────────────────────────────────────────

  it('should not flag if (a.send(1) == false) revert() — failure triggers the revert', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    if (a.send(1 ether) == false) revert("x");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag if (a.send(1) != true) revert()', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    if (a.send(1 ether) != true) revert("x");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag if (false == a.send(1)) revert() — reversed literal comparison', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    if (false == a.send(1 ether)) revert("x");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should not flag if (false == ok) revert() for a captured value', async () => {
    const code = [
      'contract S {',
      '  function f(address a) public {',
      '    (bool ok, ) = a.call("");',
      '    if (false == ok) revert("x");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag inline failure-comparison when the body does not halt', async () => {
    const code = [
      'contract V {',
      '  event Sent(bool ok);',
      '  function f(address payable a) public {',
      '    if (a.send(1 ether) == false) { emit Sent(false); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  // ──── Codex audit round 6 ────────────────────────────────────────────────

  it('should flag a negated-RHS capture: bool ok = !a.send(1)', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) public {',
      '    bool ok = !a.send(1 ether);',
      '    require(ok, "accepted");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag an OR-transformed capture: bool ok = a.send(1) || allowFailure', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool allowFailure) public {',
      '    bool ok = a.send(1 ether) || allowFailure;',
      '    require(ok, "accepted");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should accept a capture wrapped only in plain parentheses', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    bool ok = (a.send(1 ether));',
      '    require(ok, "accepted");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  // ──── Codex audit round 7 ────────────────────────────────────────────────

  it('should flag a guard nested inside a conditional block', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool shouldCheck) public {',
      '    bool ok = a.send(1 ether);',
      '    if (shouldCheck) { require(ok, "x"); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a guard in a brace-less conditional body', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool shouldCheck) public {',
      '    bool ok = a.send(1 ether);',
      '    if (shouldCheck) require(ok, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a guard nested inside a loop body', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, uint256 n) public {',
      '    bool ok = a.send(1 ether);',
      '    for (uint256 i = 0; i < n; i++) { require(ok, "x"); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should still accept a top-level guard after a conditional block', async () => {
    const code = [
      'contract S {',
      '  event Done();',
      '  function f(address payable a, bool x) public {',
      '    bool ok = a.send(1 ether);',
      '    if (x) { emit Done(); }',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  // ──── Codex audit round 8 ────────────────────────────────────────────────

  it('should flag a guard in a brace-less else body', async () => {
    const code = [
      'contract V {',
      '  event Done();',
      '  function f(address payable a, bool skip) public {',
      '    bool ok = a.send(1 ether);',
      '    if (skip) emit Done();',
      '    else require(ok, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a guard in a brace-less else-if body', async () => {
    const code = [
      'contract V {',
      '  event Done();',
      '  function f(address payable a, bool skip, bool retry) public {',
      '    bool ok = a.send(1 ether);',
      '    if (skip) emit Done();',
      '    else if (retry) require(ok, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a guard in a braced else body', async () => {
    const code = [
      'contract V {',
      '  event Done();',
      '  function f(address payable a, bool skip) public {',
      '    bool ok = a.send(1 ether);',
      '    if (skip) { emit Done(); }',
      '    else { require(ok, "x"); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should accept a guard inside an unchecked block', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1 ether);',
      '    unchecked { require(ok, "checked"); }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a guard inside a bare block', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1 ether);',
      '    { require(ok, "checked"); }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag a guard inside a try body', async () => {
    const code = [
      'contract V {',
      '  function g() public {}',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1 ether);',
      '    try this.g() { require(ok, "x"); } catch {}',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a guard inside a catch body', async () => {
    const code = [
      'contract V {',
      '  function g() public {}',
      '  function f(address payable a) public {',
      '    bool ok = a.send(1 ether);',
      '    try this.g() {} catch { require(ok, "x"); }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a guard as a brace-less do-while body', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool again) public {',
      '    bool ok = a.send(1 ether);',
      '    do require(ok, "x"); while (again);',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should accept a top-level guard after a capture inside an if block', async () => {
    const code = [
      'contract S {',
      '  function f(address a, bool go) public {',
      '    bool ok = false;',
      '    if (go) { (ok, ) = a.call(""); }',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  // ──── Codex audit round 9 ────────────────────────────────────────────────

  it('should flag a capture in a for loop guarded only after the loop', async () => {
    const code = [
      'contract V {',
      '  function f(address payable target, uint256 n) external {',
      '    bool ok;',
      '    for (uint256 i = 0; i < n; i++) { ok = target.send(1 ether); }',
      '    require(ok, "last payment failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a capture in a while loop guarded only after the loop', async () => {
    const code = [
      'contract V {',
      '  function f(address payable target, uint256 n) external {',
      '    bool ok;',
      '    uint256 i;',
      '    while (i < n) { ok = target.send(1 ether); i++; }',
      '    require(ok, "last payment failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a capture in a do loop guarded only after the loop', async () => {
    const code = [
      'contract V {',
      '  function f(address payable target, uint256 n) external {',
      '    bool ok;',
      '    uint256 i;',
      '    do { ok = target.send(1 ether); i++; } while (i < n);',
      '    require(ok, "last payment failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a capture in a brace-less for loop guarded after it', async () => {
    const code = [
      'contract V {',
      '  function f(address payable target, uint256 n) external {',
      '    bool ok;',
      '    for (uint256 i = 0; i < n; i++) ok = target.send(1 ether);',
      '    require(ok, "last payment failed");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should accept a capture guarded inside each for iteration', async () => {
    const code = [
      'contract S {',
      '  function f(address payable target, uint256 n) external {',
      '    for (uint256 i = 0; i < n; i++) {',
      '      bool ok = target.send(1 ether);',
      '      require(ok, "each payment failed");',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a capture guarded inside each while iteration', async () => {
    const code = [
      'contract S {',
      '  function f(address payable target, uint256 n) external {',
      '    uint256 i;',
      '    while (i < n) {',
      '      (bool ok, ) = target.call("");',
      '      if (!ok) revert("call failed");',
      '      i++;',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a top-level capture followed by an unrelated loop and a guard', async () => {
    const code = [
      'contract S {',
      '  function f(address payable target) external {',
      '    bool ok = target.send(1 ether);',
      '    for (uint256 i = 0; i < 3; i++) { uint256 x = i; }',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should flag an inner-loop capture guarded only in the outer loop body', async () => {
    const code = [
      'contract V {',
      '  function f(address payable target, uint256 n) external {',
      '    bool ok;',
      '    uint256 j;',
      '    while (j < n) {',
      '      for (uint256 i = 0; i < 3; i++) { ok = target.send(1 ether); }',
      '      require(ok, "x");',
      '      j++;',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should accept an inner-loop capture guarded in the same inner iteration', async () => {
    const code = [
      'contract S {',
      '  function f(address payable target, uint256 n) external {',
      '    bool ok;',
      '    uint256 j;',
      '    while (j < n) {',
      '      for (uint256 i = 0; i < 3; i++) {',
      '        ok = target.send(1 ether);',
      '        require(ok, "each");',
      '      }',
      '      j++;',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  // ──── Codex audit round 10 ───────────────────────────────────────────────

  it('should flag a loop capture when a conditional continue skips the guard', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool skip) external {',
      '    uint256 i;',
      '    while (i < 1) {',
      '      (bool ok, ) = a.call("");',
      '      i++;',
      '      if (skip) continue;',
      '      require(ok, "call failed");',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should flag a loop capture when a conditional break skips the guard', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a, bool stop) external {',
      '    uint256 i;',
      '    while (i < 1) {',
      '      (bool ok, ) = a.call("");',
      '      i++;',
      '      if (stop) break;',
      '      require(ok, "call failed");',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should accept a loop capture guarded before a later conditional continue', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a, bool skip) external {',
      '    uint256 i;',
      '    while (i < 1) {',
      '      (bool ok, ) = a.call("");',
      '      require(ok, "call failed");',
      '      i++;',
      '      if (skip) continue;',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a loop capture when a break belongs to a nested inner loop', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) external {',
      '    uint256 i;',
      '    while (i < 1) {',
      '      (bool ok, ) = a.call("");',
      '      for (uint256 k = 0; k < 1; k++) { break; }',
      '      require(ok, "call failed");',
      '      i++;',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a top-level capture with a loop containing a continue before the guard', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a, bool skip) external {',
      '    bool ok = a.send(1 ether);',
      '    for (uint256 i = 0; i < 3; i++) {',
      '      if (skip) continue;',
      '    }',
      '    require(ok, "checked");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  // ──── Codex round 11 NIT ─────────────────────────────────────────────────

  it('should accept a parenthesized inline require guard', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) external {',
      '    require((a.send(1 ether)), "failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a doubly parenthesized inline require guard', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) external {',
      '    require(((a.send(1 ether))), "failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a parenthesized negated if guard', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) external {',
      '    if ((!a.send(1 ether))) revert("failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a parenthesized failure-comparison if guard', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) external {',
      '    if ((a.send(1 ether)) == false) revert("failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a failure-comparison wrapped around the whole condition', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) external {',
      '    if ((a.send(1 ether) == false)) revert("failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should accept a leading failure comparison with a parenthesized call', async () => {
    const code = [
      'contract S {',
      '  function f(address payable a) external {',
      '    if (false == (a.send(1 ether))) revert("failed");',
      '  }',
      '}',
    ].join('\n');
    expect(await plugin.analyze(ctx(code, 'S'))).toHaveLength(0);
  });

  it('should still flag a parenthesized failure comparison inside require', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) external {',
      '    require((a.send(1 ether)) == false, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });

  it('should still flag a parenthesized arithmetic expression inside require', async () => {
    const code = [
      'contract V {',
      '  function f(address payable a) external {',
      '    require((a.send(1 ether) + 1) > 0, "x");',
      '  }',
      '}',
    ].join('\n');
    const findings = await plugin.analyze(ctx(code, 'V'));
    expect(findings).toHaveLength(1);
  });
});

describe('UncheckedReturnPlugin golden contract (human review D3)', () => {
  const plugin = new UncheckedReturnPlugin();

  const code = [
    '// SPDX-License-Identifier: MIT',
    'pragma solidity ^0.8.20;',
    '',
    'contract PaymentVault {',
    '    event Paid(address indexed to, uint256 amount);',
    '',
    '    // 1: standalone unchecked .call()',
    '    function payStandalone(address payable target) external payable {',
    '        target.call{value: msg.value}("");',
    '    }',
    '',
    '    // 2: safe .call(): captured then require(success)',
    '    function payChecked(address payable target) external payable {',
    '        (bool ok, ) = target.call{value: msg.value}("");',
    '        require(ok, "payment failed");',
    '    }',
    '',
    '    // 3: captured-but-unused .call()',
    '    function payCapturedUnused(address payable target) external payable {',
    '        (bool success, ) = target.call{value: msg.value}("");',
    '        emit Paid(target, msg.value);',
    '    }',
    '',
    '    // 4: safe .send(): bool sent then assert(sent)',
    '    function sendChecked(address payable target) external payable {',
    '        bool sent = target.send(msg.value);',
    '        assert(sent);',
    '    }',
    '',
    '    // 5: standalone unchecked .send()',
    '    function sendStandalone(address payable target) external payable {',
    '        target.send(msg.value);',
    '    }',
    '',
    '    // 6: safe .delegatecall(): if (!ok) revert',
    '    function delegateChecked(address impl, bytes calldata data) external {',
    '        (bool ok, ) = impl.delegatecall(data);',
    '        if (!ok) revert("delegatecall failed");',
    '    }',
    '',
    '    // 7: captured-but-unused .delegatecall()',
    '    function delegateUnchecked(address impl, bytes calldata data) external {',
    '        (bool done, ) = impl.delegatecall(data);',
    '    }',
    '',
    '    // 8: cross-function same-name variable: the only require(ok) is elsewhere',
    '    bool public ok;',
    '    function setOk(bool v) external { ok = v; }',
    '    function requireOk() external view { require(ok, "not set"); }',
    '    function crossFunctionTrap(address payable target) external payable {',
    '        (bool ok, ) = target.call{value: msg.value}(abi.encodeWithSignature("p()"));',
    '    }',
    '',
    '    // 9: inline require around the call',
    '    function inlineChecked(address payable target) external payable {',
    '        require(target.send(msg.value), "send failed");',
    '    }',
    '',
    '    // 10: comments/strings with fake call & guard text; .transfer() is safe',
    '    function withNoise(address payable target) external payable {',
    '        // (bool fake, ) = target.call(""); require(fake);',
    '        string memory note = "require(success) cannot save this function";',
    '        target.transfer(msg.value);',
    '    }',
    '',
    '    // 11: unsafe loop: post-loop require only sees the last iteration',
    '    function payMany(address payable[] calldata targets) external {',
    '        bool ok;',
    '        for (uint256 i = 0; i < targets.length; i++) {',
    '            ok = targets[i].send(1 ether);',
    '        }',
    '        require(ok, "a payment failed");',
    '    }',
    '',
    '    // 12: safe loop: per-iteration guard',
    '    function payManyChecked(address payable[] calldata targets) external {',
    '        for (uint256 i = 0; i < targets.length; i++) {',
    '            (bool ok, ) = targets[i].call("");',
    '            require(ok, "payment failed");',
    '        }',
    '    }',
    '',
    '    // 13: polarity trap: require(!ok) reverts on SUCCESS, not on failure',
    '    function polarityTrap(address payable target) external payable {',
    '        (bool ok, ) = target.call("");',
    '        require(!ok, "unexpected success");',
    '    }',
    '}',
  ].join('\n');

  it('reports exactly the seven unsafe call sites with kind and location', async () => {
    const lines = code.split('\n');
    const lineOf = (stmt: string): number => {
      const idx = lines.findIndex((l) => l.trim() === stmt);
      expect(idx, `golden statement not found: ${stmt}`).toBeGreaterThanOrEqual(0);
      return idx + 1;
    };

    // expected findings in source order: the exact statement, its line, and kind
    const expected = [
      { stmt: 'target.call{value: msg.value}("");', kind: '.call()' },
      { stmt: '(bool success, ) = target.call{value: msg.value}("");', kind: '.call()' },
      { stmt: 'target.send(msg.value);', kind: '.send()' },
      { stmt: '(bool done, ) = impl.delegatecall(data);', kind: '.delegatecall()' },
      {
        stmt: '(bool ok, ) = target.call{value: msg.value}(abi.encodeWithSignature("p()"));',
        kind: '.call()',
      },
      { stmt: 'ok = targets[i].send(1 ether);', kind: '.send()' },
      { stmt: '(bool ok, ) = target.call("");', kind: '.call()' },
    ].map((e) => ({ ...e, line: lineOf(e.stmt) }));

    const findings = await plugin.analyze(ctx(code, 'PaymentVault'));

    expect(findings).toHaveLength(expected.length);
    expected.forEach((exp, i) => {
      const f = findings[i];
      expect(f?.pluginId).toBe('unchecked-return');
      expect(f?.severity).toBe(FindingSeverity.MEDIUM);
      expect(f?.lineStart).toBe(exp.line);
      expect(f?.description).toContain('Low-level `' + exp.kind + '`');
      expect(f?.codeSnippet).toBe(exp.stmt);
    });
  });

  it('never reports the safe patterns in the golden contract', async () => {
    const findings = await plugin.analyze(ctx(code, 'PaymentVault'));
    const lines = code.split('\n');
    const safeStatements = [
      '(bool ok, ) = target.call{value: msg.value}("");', // #2 guarded
      'bool sent = target.send(msg.value);', // #4 guarded
      '(bool ok, ) = impl.delegatecall(data);', // #6 guarded
      'require(target.send(msg.value), "send failed");', // #9 inline
      'target.transfer(msg.value);', // #10 transfer excluded
      '(bool ok, ) = targets[i].call("");', // #12 per-iteration guard
    ];
    for (const stmt of safeStatements) {
      const safeLine = lines.findIndex((l) => l.trim() === stmt) + 1;
      expect(
        findings.some((f) => f.lineStart === safeLine),
        `safe statement on line ${safeLine} was reported: ${stmt}`,
      ).toBe(false);
    }
  });
});
