import { describe, expect, it } from 'vitest';
import { UncheckedReturnPlugin } from './index';

const context = (sourceCode: string) => ({
  contractName: 'Vault',
  sourceCode,
  chain: 'ethereum',
  language: 'solidity',
  compilerVersion: '0.8.24',
  metadata: {},
});

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  it('exposes metadata and supports Solidity on Ethereum', async () => {
    await plugin.initialize();
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.severity).toBe('HIGH');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
    expect(plugin.supportsContext(context(''))).toBe(true);
    expect(plugin.supportsContext({ ...context(''), chain: 'unknown' })).toBe(false);
    expect(plugin.supportsContext({ ...context(''), language: 'vyper' })).toBe(false);
  });

  it('detects unchecked call, send, delegatecall, and transfer', async () => {
    const findings = await plugin.analyze(context([
      'addr.call("");',
      'payee.send(amount);',
      'target.delegatecall(data);',
      'recipient.transfer(amount);',
    ].join('\n')));

    expect(findings).toHaveLength(4);
    expect(findings.map((finding) => finding.lineStart)).toEqual([1, 2, 3, 4]);
    expect(findings[0]?.recommendation).toContain('require(success)');
    expect(plugin.getFixRecommendation(findings[0]!)).toContain('Vault.sol:1');
  });

  it('does not report checked results or comments', async () => {
    const findings = await plugin.analyze(context([
      '(bool success, ) = addr.call("");',
      'require(addr.send(amount));',
      'if (!target.delegatecall(data)) { revert(); }',
      '// recipient.transfer(amount);',
      '/* addr.call(""); */',
    ].join('\n')));

    expect(findings).toHaveLength(0);
  });

  it('returns no findings for unsupported contexts', async () => {
    const findings = await plugin.analyze({ ...context('addr.call("");'), chain: 'solana' });
    expect(findings).toHaveLength(0);
  });
});
