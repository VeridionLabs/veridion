import { describe, it, expect } from 'vitest';
import { OraclePlugin } from './index';

describe('OraclePlugin', () => {
  const plugin = new OraclePlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('oracle');
  });

  it('should detect AMM spot price usage', async () => {
    const code = `
contract PriceOracle {
    function getPrice(address pair) public view returns (uint) {
        (uint reserve0, uint reserve1,) = IUniswapV2Pair(pair).getReserves();
        return reserve1 * 1e18 / reserve0;
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'PriceOracle',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.some((f) => f.title.includes('Oracle Manipulation'))).toBe(true);
  });
});
