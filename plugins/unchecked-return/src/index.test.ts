import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { describe, expect, it } from 'vitest';

import {
  extractFunctionScopes,
  getAssignmentVar,
  isDirectlyChecked,
  isValidTruthCheck,
  maskCommentsAndStrings,
  UncheckedReturnPlugin,
} from './index';

function createCtx(sourceCode: string, contractName = 'TestContract'): AnalysisContext {
  return {
    contractName,
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.20',
    metadata: {},
  };
}

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  describe('metadata & lifecycle', () => {
    it('should expose correct plugin metadata', () => {
      expect(plugin.metadata.id).toBe('unchecked-return');
      expect(plugin.metadata.name).toBe('Unchecked Return Value Detector');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.severity).toBe(FindingSeverity.HIGH);
      expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
      expect(plugin.metadata.chains).toContain('ethereum');
      expect(plugin.metadata.languages).toContain('solidity');
      expect(plugin.metadata.tags).toContain('unchecked-return');
      expect(plugin.metadata.tags).toContain('swc-104');
      expect(plugin.metadata.references?.length).toBeGreaterThan(0);
    });

    it('should initialize without error', async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
    });

    it('should provide fix recommendation text', () => {
      const rec = plugin.getFixRecommendation({
        pluginId: 'unchecked-return',
        title: 'Unchecked Return Value from .call()',
        description: 'test',
        severity: FindingSeverity.HIGH,
        filePath: 'Test.sol',
        lineStart: 10,
        lineEnd: 10,
        codeSnippet: 'a.call("")',
        recommendation: 'Check return value',
        confidence: 0.9,
        references: [],
      });
      expect(rec).toContain('require(success');
      expect(rec).toContain('.send()');
      expect(rec).toContain('.delegatecall()');
    });
  });

  describe('supportsContext', () => {
    it('should support Solidity on Ethereum', () => {
      expect(plugin.supportsContext(createCtx(''))).toBe(true);
    });

    it('should support other EVM chains in metadata', () => {
      expect(plugin.supportsContext({ ...createCtx(''), chain: 'polygon' })).toBe(true);
      expect(plugin.supportsContext({ ...createCtx(''), chain: 'arbitrum' })).toBe(true);
    });

    it('should reject unsupported languages', () => {
      expect(plugin.supportsContext({ ...createCtx(''), language: 'vyper' })).toBe(false);
      expect(plugin.supportsContext({ ...createCtx(''), language: 'rust' })).toBe(false);
    });

    it('should reject unsupported chains', () => {
      expect(plugin.supportsContext({ ...createCtx(''), chain: 'solana' })).toBe(false);
      expect(plugin.supportsContext({ ...createCtx(''), chain: 'bitcoin' })).toBe(false);
    });
  });

  describe('positive cases: standalone calls', () => {
    it('should detect unchecked .call()', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        recipient.call("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.pluginId).toBe('unchecked-return');
      expect(findings[0]?.title).toBe('Unchecked Return Value from .call()');
      expect(findings[0]?.codeSnippet).toContain('recipient.call');
      expect(findings[0]?.lineStart).toBe(4);
    });

    it('should detect unchecked .call() with value brace options', async () => {
      const code = `
contract Vulnerable {
    function payout(address payable recipient, uint256 amount) public {
        recipient.call{value: amount}("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.description).toContain('.call()');
    });

    it('should detect unchecked .send()', async () => {
      const code = `
contract Vulnerable {
    function sendEther(address payable recipient) public {
        recipient.send(1 ether);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Unchecked Return Value from .send()');
      expect(findings[0]?.codeSnippet).toContain('recipient.send');
    });

    it('should detect unchecked .delegatecall()', async () => {
      const code = `
contract Vulnerable {
    function forward(address target, bytes memory data) public {
        target.delegatecall(data);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Unchecked Return Value from .delegatecall()');
    });

    it('should detect unchecked .delegatecall() with gas option', async () => {
      const code = `
contract Vulnerable {
    function forward(address target, bytes memory data) public {
        target.delegatecall{gas: 50000}(data);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should detect calls on complex receiver expressions', async () => {
      const code = `
contract Vulnerable {
    function execute(address a) public {
        payable(a).call{value: 1 ether}("");
        address(this).call("");
        getRecipient().call("");
    }
    function getRecipient() internal pure returns (address) {
        return address(0);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(3);
    });
  });

  describe('positive cases: captured but never validated', () => {
    it('should detect captured-but-unused tuple return value', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        // success is never checked with require() or if
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.description).toContain('success');
    });

    it('should detect captured-but-unused multi-element tuple', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (bool success, bytes memory data) = recipient.call("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should detect tuple with omitted boolean capture', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (, bytes memory data) = recipient.call("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should detect captured-but-unused single-variable send', async () => {
      const code = `
contract Vulnerable {
    function sendEth(address payable recipient) public {
        bool sent = recipient.send(1 ether);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.description).toContain('sent');
    });

    it('should detect pre-declared variable capture that is never checked', async () => {
      const code = `
contract Vulnerable {
    function sendEth(address payable recipient) public {
        bool sent;
        sent = recipient.send(1 ether);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should detect pre-declared tuple assignment that is never checked', async () => {
      const code = `
contract Vulnerable {
    function sendEth(address payable recipient) public {
        bool ok;
        (ok, ) = recipient.call("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should detect variable re-assignment before check', async () => {
      const code = `
contract Vulnerable {
    function sendEth(address a1, address a2) public {
        (bool ok, ) = a1.call("");
        (ok, ) = a2.call("");
        require(ok); // only checks a2, a1 was overwritten!
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.codeSnippet).toContain('a1.call');
    });

    it('should flag call when variable is only used in non-halting if block', async () => {
      const code = `
contract Vulnerable {
    event Log(bool status);
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        if (success) {
            emit Log(success);
        }
        // execution continues even if success is false!
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should flag inline if condition when body does not halt', async () => {
      const code = `
contract Vulnerable {
    event Sent(bool ok);
    function sendEth(address payable recipient) public {
        if (recipient.send(1 ether)) {
            emit Sent(true);
        }
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should flag inverted check require(!success)', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        require(!success);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should flag inverted equality check require(success == false)', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        require(success == false);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should flag comparison against another variable require(ok == trueFlag)', async () => {
      const code = `
contract Vulnerable {
    bool trueFlag = false;
    function withdraw(address payable recipient) public {
        (bool ok, ) = recipient.call("");
        require(ok == trueFlag);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should flag reverse comparison against another variable require(trueFlag == ok)', async () => {
      const code = `
contract Vulnerable {
    bool trueFlag = false;
    function withdraw(address payable recipient) public {
        (bool ok, ) = recipient.call("");
        require(trueFlag == ok);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should flag inverted inequality check require(ok != true)', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (bool ok, ) = recipient.call("");
        require(ok != true);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should flag call if require appears before assignment', async () => {
      const code = `
contract Vulnerable {
    function sendEth(address payable recipient) public {
        bool sent;
        require(sent, "premature check");
        sent = recipient.send(1 ether);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should detect unchecked call inside an if block when require precedes it', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient, bool eligible) public {
        require(msg.sender == address(0), "not auth");
        if (eligible) {
            recipient.call("");
        }
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.lineStart).toBe(6);
    });

    it('should not treat external object method assert() as Solidity assert()', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (bool ok, ) = recipient.call("");
        verifier.assert(ok);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });
  });

  describe('safe patterns: properly checked calls', () => {
    it('should not flag require(success)', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient, uint256 amount) public {
        (bool success, ) = recipient.call{value: amount}("");
        require(success);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag require(success, "msg")', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        require(success, "Transfer failed");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag require(success == true)', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        require(success == true);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag require(true == success)', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        require(true == success);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag assert(success)', async () => {
      const code = `
contract Safe {
    function execute(address target, bytes memory data) public {
        (bool success, ) = target.delegatecall(data);
        assert(success);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag if (!success) revert()', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        if (!success) revert("Call failed");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag if (!success) { revert(); } block', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        if (!success) {
            revert CustomError();
        }
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag if (!success) return;', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        if (!success) return;
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag if (success) { ... } else { revert(); }', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        if (success) {
            doSomething();
        } else {
            revert("Failed");
        }
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag inline require(target.send(...))', async () => {
      const code = `
contract Safe {
    function sendEth(address payable recipient) public {
        require(recipient.send(1 ether), "Send failed");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag inline assert(target.send(...))', async () => {
      const code = `
contract Safe {
    function sendEth(address payable recipient) public {
        assert(recipient.send(1 ether));
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag inline if (!target.send(...)) revert()', async () => {
      const code = `
contract Safe {
    function sendEth(address payable recipient) public {
        if (!recipient.send(1 ether)) revert("Send failed");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag inline if (!target.send(...)) { revert(); }', async () => {
      const code = `
contract Safe {
    function sendEth(address payable recipient) public {
        if (!recipient.send(1 ether)) {
            revert("Send failed");
        }
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag direct return of call expression', async () => {
      const code = `
contract Safe {
    function forwardSend(address payable recipient) public returns (bool) {
        return recipient.send(1 ether);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag returning the captured boolean variable', async () => {
      const code = `
contract Safe {
    function forwardCall(address target) public returns (bool) {
        (bool ok, ) = target.call("");
        return ok;
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not flag safe require(success) when subsequent variable assignments exist', async () => {
      const code = `
contract Safe {
    mapping(address => uint256) public balances;
    function withdraw(address payable recipient, uint256 amount) public {
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "Transfer failed");
        balances[recipient] = 0;
        uint256 x = 42;
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should handle nested parentheses in require((success))', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient) public {
        (bool ok, ) = recipient.call("");
        require(((ok)));
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should handle compound boolean expressions in require(amount > 0 && success)', async () => {
      const code = `
contract Safe {
    function withdraw(address payable recipient, uint256 amount) public {
        (bool ok, ) = recipient.call{value: amount}("");
        require(amount > 0 && ok, "Invalid");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });
  });

  describe('scope isolation & independent checks', () => {
    it('should not let a check in one function validate a call in another function', async () => {
      const code = `
contract MultiFunction {
    function bad(address target) public {
        (bool success, ) = target.call("");
    }

    function good(address target) public {
        (bool success, ) = target.call("");
        require(success);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.lineStart).toBe(4);
    });

    it('should flag independent calls in constructors and modifiers', async () => {
      const code = `
contract Modifiers {
    constructor(address target) {
        target.call("");
    }
    modifier withCall(address target) {
        (bool ok, ) = target.call("");
        _;
    }
    function safeFunc(address target) public {
        (bool ok, ) = target.call("");
        require(ok);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(2);
    });

    it('should isolate functions across multiple contracts in the same file', async () => {
      const code = `
contract SafeContract {
    function run(address target) public {
        (bool ok, ) = target.call("");
        require(ok);
    }
}
contract BadContract {
    function run(address target) public {
        (bool ok, ) = target.call("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.codeSnippet).toContain('target.call');
    });
  });

  describe('exclusions & formatting edge cases', () => {
    it('should ignore address.transfer() as it reverts automatically', async () => {
      const code = `
contract SafeTransfer {
    function withdraw(address payable recipient) public {
        recipient.transfer(1 ether);
        payable(msg.sender).transfer(2 ether);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should ignore ERC20 token.transfer() calls', async () => {
      const code = `
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}
contract TokenHolder {
    function sendTokens(IERC20 token, address to) public {
        token.transfer(to, 100);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should ignore calls in single-line and multi-line comments', async () => {
      const code = `
contract Comments {
    // a.call("");
    // (bool ok, ) = a.send(1);
    /*
       target.delegatecall(data);
       (bool success, ) = target.call("");
    */
    function valid() public {}
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should not consider commented-out require() as a check', async () => {
      const code = `
contract Vulnerable {
    function withdraw(address payable recipient) public {
        (bool success, ) = recipient.call("");
        // require(success);
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should ignore calls inside string literals', async () => {
      const code = `
contract Strings {
    string msg1 = "recipient.call('') returns (bool, bytes)";
    string msg2 = 'recipient.send(1)';
    function test() public {}
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should ignore lookalike function names', async () => {
      const code = `
contract Lookalikes {
    function callSomething(bytes memory) external {}
    function callback() external {}
    function sendMessage(string calldata) external {}

    function run() public {
        callSomething("");
        callback();
        sendMessage("hello");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(0);
    });

    it('should handle multi-line call statements with formatting', async () => {
      const code = `
contract MultiLine {
    function pay(address payable recipient) public {
        (bool success, ) = recipient.call{
            value: 1 ether,
            gas: 20000
        }("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should handle multiple calls on the same line', async () => {
      const code = `
contract MultiOnLine {
    function pay(address a, address b) public {
        a.call(""); b.call("");
    }
}`;
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(2);
    });

    it('should handle CRLF line endings', async () => {
      const code = [
        'contract CRLF {',
        '    function pay(address payable recipient) public {',
        '        recipient.send(1 ether);',
        '    }',
        '}',
      ].join('\r\n');
      const findings = await plugin.analyze(createCtx(code));
      expect(findings).toHaveLength(1);
    });

    it('should handle empty contract or whitespace gracefully', async () => {
      expect(await plugin.analyze(createCtx(''))).toHaveLength(0);
      expect(await plugin.analyze(createCtx('   \n\t   '))).toHaveLength(0);
      expect(await plugin.analyze(createCtx('contract Empty {}'))).toHaveLength(0);
      expect(await plugin.analyze(createCtx('pragma solidity ^0.8.20;'))).toHaveLength(0);
    });
  });

  describe('internal helper unit tests', () => {
    it('maskCommentsAndStrings should preserve character length and newlines', () => {
      const input = 'contract A {\n  // comment\n  string s = "test";\n}';
      const masked = maskCommentsAndStrings(input);
      expect(masked.length).toBe(input.length);
      expect(masked.split('\n')).toHaveLength(input.split('\n').length);
      expect(masked).not.toContain('comment');
      expect(masked).not.toContain('test');
    });

    it('extractFunctionScopes should find function boundaries accurately', () => {
      const code = 'contract A { function f1() public { a(); } function f2() external; }';
      const scopes = extractFunctionScopes(code);
      const s0 = scopes[0];
      expect(s0).toBeDefined();
      if (!s0) throw new Error('Scope not found');
      expect(code.slice(s0.start, s0.end + 1)).toBe('{ a(); }');
    });

    it('isValidTruthCheck should accurately accept and reject conditions', () => {
      expect(isValidTruthCheck('ok', 'ok')).toBe(true);
      expect(isValidTruthCheck('ok == true', 'ok')).toBe(true);
      expect(isValidTruthCheck('true == ok', 'ok')).toBe(true);
      expect(isValidTruthCheck('(ok)', 'ok')).toBe(true);
      expect(isValidTruthCheck('((ok == true))', 'ok')).toBe(true);
      expect(isValidTruthCheck('!ok', 'ok')).toBe(false);
      expect(isValidTruthCheck('ok == false', 'ok')).toBe(false);
      expect(isValidTruthCheck('false == ok', 'ok')).toBe(false);
      expect(isValidTruthCheck('ok != true', 'ok')).toBe(false);
      expect(isValidTruthCheck('true != ok', 'ok')).toBe(false);
      expect(isValidTruthCheck('ok == trueFlag', 'ok')).toBe(false);
      expect(isValidTruthCheck('trueFlag == ok', 'ok')).toBe(false);
    });

    it('isDirectlyChecked should identify inline validation', () => {
      expect(isDirectlyChecked('return a.send(1);')).toBe(true);
      expect(isDirectlyChecked('require(a.send(1), "msg");')).toBe(true);
      expect(isDirectlyChecked('require(!a.send(1));')).toBe(false);
      expect(isDirectlyChecked('if (!a.send(1)) revert();')).toBe(true);
      expect(isDirectlyChecked('if (a.send(1)) emit S();')).toBe(false);
      expect(isDirectlyChecked('if (a.send(1)) emit S(); else revert();')).toBe(true);
    });

    it('getAssignmentVar should extract variable names from tuples and declarations', () => {
      expect(getAssignmentVar('(bool success, ) =')).toEqual({
        isAssigned: true,
        varName: 'success',
      });
      expect(getAssignmentVar('(bool success, bytes memory data) =')).toEqual({
        isAssigned: true,
        varName: 'success',
      });
      expect(getAssignmentVar('(, bytes memory data) =')).toEqual({
        isAssigned: true,
        varName: null,
      });
      expect(getAssignmentVar('bool sent =')).toEqual({ isAssigned: true, varName: 'sent' });
      expect(getAssignmentVar('sent =')).toEqual({ isAssigned: true, varName: 'sent' });
      expect(getAssignmentVar('a.call("");')).toEqual({ isAssigned: false, varName: null });
    });
  });
});
