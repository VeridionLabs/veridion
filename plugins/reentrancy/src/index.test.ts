import { describe, expect, it } from 'vitest';

import { ReentrancyPlugin } from './index';

describe('ReentrancyPlugin', () => {
  const plugin = new ReentrancyPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('reentrancy');
    expect(plugin.metadata.severity).toBe('CRITICAL');
    expect(plugin.metadata.category).toBe('REENTRANCY');
  });

  it('should support solidity on ethereum', () => {
    expect(
      plugin.supportsContext({
        contractName: 'Test',
        sourceCode: '',
        chain: 'ethereum',
        language: 'solidity',
        compilerVersion: null,
        metadata: {},
      }),
    ).toBe(true);
  });

  it('should detect .call before state changes', async () => {
    const vulnerableCode = `
contract Vulnerable {
    mapping(address => uint) balances;
    
    function withdraw() public {
        uint amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] = 0;
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Vulnerable',
      sourceCode: vulnerableCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.pluginId).toBe('reentrancy');
  });

  it('should not flag code with reentrancy guard', async () => {
    const safeCode = `
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Safe is ReentrancyGuard {
    mapping(address => uint) balances;
    
    function withdraw() public nonReentrant {
        uint amount = balances[msg.sender];
        balances[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Safe',
      sourceCode: safeCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });
});
