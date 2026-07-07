import { describe, it, expect } from 'vitest';
import { OverflowPlugin } from './index';

describe('OverflowPlugin', () => {
  const plugin = new OverflowPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('overflow');
  });

  it('should detect unchecked blocks', async () => {
    const code = `
pragma solidity ^0.8.0;
contract Test {
    function foo(uint a, uint b) public pure returns (uint) {
        unchecked { return a + b; }
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
  });

  it('should warn about old solidity versions without SafeMath', async () => {
    const code = `
pragma solidity ^0.6.0;
contract Old {
    uint public total;
    function add(uint a) public { total += a; }
}`;

    const findings = await plugin.analyze({
      contractName: 'Old',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.6.12',
      metadata: {},
    });

    expect(findings.some((f) => f.title.includes('Overflow Protection'))).toBe(true);
  });
});
