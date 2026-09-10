import type { AnalysisContext } from '@veridion/scanner-types';
import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  const createContext = (sourceCode: string): AnalysisContext => ({
    contractName: 'Test',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.19',
    metadata: {},
  });

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.metadata.id).toBe('unchecked-return');
      expect(plugin.metadata.name).toBe('Unchecked Return Value Detector');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.severity).toBe('HIGH');
      expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
      expect(plugin.metadata.languages).toContain('solidity');
      expect(plugin.metadata.tags).toContain('unchecked-return');
    });

    it('should have references defined', () => {
      expect(plugin.metadata.references?.length).toBeGreaterThan(0);
    });
  });

  describe('supportsContext', () => {
    it('should support solidity on ethereum', () => {
      expect(plugin.supportsContext(createContext(''))).toBe(true);
    });

    it('should support other configured chains', () => {
      expect(plugin.supportsContext({ ...createContext(''), chain: 'polygon' })).toBe(true);
    });

    it('should not support unsupported chains', () => {
      expect(plugin.supportsContext({ ...createContext(''), chain: 'solana' })).toBe(false);
    });

    it('should not support unsupported languages', () => {
      expect(plugin.supportsContext({ ...createContext(''), language: 'vyper' })).toBe(false);
    });
  });

  describe('detection', () => {
    it('should detect unchecked address.call()', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    function ping(address target) external {
        target.call(abi.encodeWithSignature("foo()"));
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toContain('address.call()');
      expect(findings[0]?.severity).toBe('HIGH');
      expect(findings[0]?.lineStart).toBe(5);
    });

    it('should detect unchecked address.send()', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    function payout(address payable recipient) external payable {
        recipient.send(msg.value);
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toContain('address.send()');
    });

    it('should detect unchecked address.delegatecall() with CRITICAL severity', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Proxy {
    function forward(address logic, bytes memory data) external {
        logic.delegatecall(data);
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toContain('address.delegatecall()');
      expect(findings[0]?.severity).toBe('CRITICAL');
    });

    it('should detect unchecked call with value options', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    function withdraw(address payable to, uint amount) external {
        to.call{value: amount}("");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.codeSnippet).toContain('call{value: amount}');
    });

    it('should detect multiple unchecked calls in one contract', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    event Done();

    function two(address a, address b) external {
        a.call("");
        b.send(1 ether);
        emit Done();
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(2);
    });

    it('should report correct pluginId and references', async () => {
      const code = `
contract Vulnerable {
    function f(address a) external {
        a.call("");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.pluginId).toBe('unchecked-return');
      expect(findings[0]?.references.length).toBeGreaterThan(0);
    });
  });

  describe('checked code (no findings)', () => {
    it('should not flag call result captured and required', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function withdraw(address payable to, uint amount) external {
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag send result stored in bool variable', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function payout(address payable to) external payable {
        bool ok = to.send(msg.value);
        require(ok);
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag call result used in if condition', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function tryCall(address a) external {
        if (a.call(abi.encodeWithSignature("foo()"))) {
            // handle success
        }
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag call result used in require condition', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function tryCall(address a) external {
        require(a.call(abi.encodeWithSignature("foo()")), "call failed");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag result assigned to existing variable', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function tryCall(address a) external {
        bool ok;
        ok = a.call("");
        require(ok);
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag delegatecall result captured and required', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Proxy {
    function forward(address logic, bytes memory data) external {
        (bool success, ) = logic.delegatecall(data);
        require(success, "Delegatecall failed");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag calls wrapped in return', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function tryCall(address a) external returns (bool) {
        return a.call("");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag calls mentioned in comments', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function f(address a) external {
        // a.call("") is dangerous when unchecked
        // a.send(1 ether) too
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should return no findings for empty contract', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Empty {}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should return no findings for empty source', async () => {
      const findings = await plugin.analyze(createContext(''));

      expect(findings).toEqual([]);
    });

    it('should handle multi-line call statements', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    function f(address payable to, uint amount) external {
        to.call{value: amount}(
            abi.encodeWithSignature("transfer(uint256,uint256)", 1, 2)
        );
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.lineStart).toBe(5);
    });

    it('should handle calls on struct members and mappings', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    struct Recipient { address payable account; }
    mapping(uint => Recipient) recipients;

    function f(uint i) external {
        recipients[i].account.call("");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
    });

    it('should not flag non-address calls like ERC20 transfer', async () => {
      const code = `
pragma solidity ^0.8.0;
interface IERC20 {
    function transfer(address to, uint amount) external returns (bool);
}
contract Safe {
    IERC20 token;
    function f(address to, uint amount) external {
        token.transfer(to, amount);
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(0);
    });

    it('should not flag unused-address warnings as findings (no crash on odd formatting)', async () => {
      const code = `
contract T {
  function f(address a) public { a . call ( "" ) ; }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
    });
  });

  describe('getFixRecommendation', () => {
    it('should provide a require(success) pattern fix recommendation', async () => {
      const code = `
contract Vulnerable {
    function f(address a) external {
        a.call("");
    }
}`;

      const findings = await plugin.analyze(createContext(code));
      const finding = findings[0];
      expect(finding).toBeDefined();
      if (!finding) return;

      const fix = plugin.getFixRecommendation(finding);

      expect(fix).toContain('require(success');
      expect(fix).toContain('bool success');
    });

    it('should include a send-specific alternative in the fix', async () => {
      const code = `
contract Vulnerable {
    function f(address payable a) external {
        a.send(1 ether);
    }
}`;

      const findings = await plugin.analyze(createContext(code));
      const finding = findings[0];
      expect(finding).toBeDefined();
      if (!finding) return;

      const fix = plugin.getFixRecommendation(finding);

      expect(fix).toContain('.send(');
      expect(fix).toContain('require(sent');
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
      await expect(plugin.initialize({ custom: true })).resolves.toBeUndefined();
    });
  });
});
