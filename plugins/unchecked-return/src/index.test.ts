import { describe, it, expect } from 'vitest';
import { UncheckedReturnPlugin } from './index';

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
  });

  it('should detect unchecked .call()', async () => {
    const code = `
contract Test {
    function pay(address to) public {
        to.call{value: 1 ether}("");
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Test',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.some((f) => f.title.includes('Unchecked'))).toBe(true);
    expect(findings[0]?.recommendation).toContain('require(success)');
  });

  it('should detect unchecked .send()', async () => {
    const code = `
contract Test {
    function pay(address payable to) public {
        to.send(1 ether);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Test',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.some((f) => f.codeSnippet.includes('.send'))).toBe(true);
  });

  it('should detect unchecked .delegatecall()', async () => {
    const code = `
contract Test {
    function run(address target, bytes memory data) public {
        target.delegatecall(data);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Test',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.some((f) => f.codeSnippet.includes('.delegatecall'))).toBe(true);
  });

  it('should not flag checked calls', async () => {
    const code = `
contract Test {
    function pay(address to) public {
        (bool success, ) = to.call{value: 1 ether}("");
        require(success);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Test',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });
});
