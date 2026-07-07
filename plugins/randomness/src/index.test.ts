import { describe, it, expect } from 'vitest';
import { RandomnessPlugin } from './index';

describe('RandomnessPlugin', () => {
  const plugin = new RandomnessPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('randomness');
  });

  it('should detect block.timestamp usage', async () => {
    const code = `
contract HashGame {
    function generateRandom() public view returns (uint) {
        return uint(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'HashGame',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.some((f) => f.title.includes('block.timestamp'))).toBe(true);
  });
});
