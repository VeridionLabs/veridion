import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

const ctx = (contractName: string, sourceCode: string) => ({
  contractName,
  sourceCode,
  chain: 'ethereum',
  language: 'solidity',
  compilerVersion: '0.8.19',
  metadata: {},
});

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.severity).toBe('MEDIUM');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
  });

  it('should support solidity on ethereum', () => {
    expect(plugin.supportsContext(ctx('Test', ''))).toBe(true);
  });

  it('should not support vyper or non-configured chains', () => {
    expect(
      plugin.supportsContext({ ...ctx('Test', ''), language: 'vyper' }),
    ).toBe(false);
    expect(
      plugin.supportsContext({ ...ctx('Test', ''), chain: 'solana' }),
    ).toBe(false);
  });

  it('should detect an unchecked .send() return value', async () => {
    const code = `
contract Vulnerable {
    function pay(address payable to, uint256 amount) public {
        to.send(amount);
    }
}`;
    const findings = await plugin.analyze(ctx('Vulnerable', code));
    expect(findings.length).toBe(1);
    expect(findings[0]?.pluginId).toBe('unchecked-return');
    expect(findings[0]?.title).toContain('send');
  });

  it('should detect an unchecked .call() return value', async () => {
    const code = `
contract Vulnerable {
    function pay(address to, uint256 amount) public {
        to.call{value: amount}("");
    }
}`;
    const findings = await plugin.analyze(ctx('Vulnerable', code));
    expect(findings.length).toBe(1);
    expect(findings[0]?.title).toContain('call');
  });

  it('should detect an unchecked .delegatecall() return value', async () => {
    const code = `
contract Vulnerable {
    function forward(address impl, bytes calldata data) public {
        impl.delegatecall(data);
    }
}`;
    const findings = await plugin.analyze(ctx('Vulnerable', code));
    expect(findings.length).toBe(1);
    expect(findings[0]?.title).toContain('delegatecall');
  });

  it('should NOT flag a send() checked with require', async () => {
    const code = `
contract Safe {
    function pay(address payable to, uint256 amount) public {
        require(to.send(amount), "send failed");
    }
}`;
    const findings = await plugin.analyze(ctx('Safe', code));
    expect(findings.length).toBe(0);
  });

  it('should NOT flag a call() whose result is captured and checked', async () => {
    const code = `
contract Safe {
    function pay(address to, uint256 amount) public {
        (bool success, ) = to.call{value: amount}("");
        require(success, "call failed");
    }
}`;
    const findings = await plugin.analyze(ctx('Safe', code));
    expect(findings.length).toBe(0);
  });

  it('should NOT flag a send() assigned to a bool variable', async () => {
    const code = `
contract Safe {
    function pay(address payable to, uint256 amount) public {
        bool ok = to.send(amount);
        require(ok);
    }
}`;
    const findings = await plugin.analyze(ctx('Safe', code));
    expect(findings.length).toBe(0);
  });

  it('should NOT flag a call() used directly in an if condition', async () => {
    const code = `
contract Safe {
    function pay(address to) public {
        if (to.call("")) {
            revert();
        }
    }
}`;
    const findings = await plugin.analyze(ctx('Safe', code));
    expect(findings.length).toBe(0);
  });

  it('should ignore matches inside comments', async () => {
    const code = `
contract Documented {
    // to.send(amount); is unsafe, do not do this
    function pay() public {}
}`;
    const findings = await plugin.analyze(ctx('Documented', code));
    expect(findings.length).toBe(0);
  });

  it('should flag multiple distinct unchecked calls', async () => {
    const code = `
contract Vulnerable {
    function a(address payable to, uint256 amount) public {
        to.send(amount);
        to.call{value: amount}("");
    }
}`;
    const findings = await plugin.analyze(ctx('Vulnerable', code));
    expect(findings.length).toBe(2);
  });

  it('should provide a require(success) fix recommendation', async () => {
    const code = `
contract Vulnerable {
    function pay(address to) public {
        to.call("");
    }
}`;
    const findings = await plugin.analyze(ctx('Vulnerable', code));
    const finding = findings[0];
    expect(finding).toBeDefined();
    if (!finding) return;
    const fix = plugin.getFixRecommendation(finding);
    expect(fix).toContain('require(success)');
    expect(fix).toContain('Vulnerable.sol');
  });

  it('should initialize without error', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
  });
});
