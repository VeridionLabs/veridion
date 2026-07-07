import { describe, it, expect } from 'vitest';
import { DosPlugin } from './index';

describe('DosPlugin', () => {
  const plugin = new DosPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('dos');
  });

  it('should detect unbounded loops', async () => {
    const code = `
contract GasHog {
    address[] public users;
    
    function refundAll() public {
        for (uint i = 0; i < users.length; i++) {
            payable(users[i]).transfer(1 ether);
        }
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'GasHog',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.some((f) => f.title.includes('Unbounded Loop'))).toBe(true);
  });
});
