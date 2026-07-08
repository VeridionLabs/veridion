import { describe, expect, it } from 'vitest';

import { GasPlugin } from './index';

describe('GasPlugin', () => {
  const plugin = new GasPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('gas');
    expect(plugin.metadata.severity).toBe('GAS');
  });

  it('should detect i++ in loops', async () => {
    const code = `
contract GasHeavy {
    function sum(uint[] memory arr) public pure returns (uint) {
        uint total = 0;
        for (uint i = 0; i < arr.length; i++) {
            total += arr[i];
        }
        return total;
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'GasHeavy',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
  });
});
