import { describe, expect, it } from 'vitest';

import { AccessControlPlugin } from './index';

describe('AccessControlPlugin', () => {
  const plugin = new AccessControlPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('access-control');
    expect(plugin.metadata.severity).toBe('CRITICAL');
    expect(plugin.metadata.category).toBe('ACCESS_CONTROL');
  });

  it('should detect withdraw without access control', async () => {
    const code = `
contract NoAuth {
    function withdraw(uint amount) public {
        payable(msg.sender).transfer(amount);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'NoAuth',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.includes('withdraw'))).toBe(true);
  });

  it('should not flag functions with onlyOwner', async () => {
    const code = `
import "@openzeppelin/contracts/access/Ownable.sol";

contract Safe is Ownable {
    function withdraw(uint amount) public onlyOwner {
        payable(msg.sender).transfer(amount);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Safe',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });
});
