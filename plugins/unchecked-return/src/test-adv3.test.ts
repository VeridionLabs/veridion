import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

describe('UncheckedReturnPlugin bugs', () => {
  const plugin = new UncheckedReturnPlugin();

  it('should not flag return with parens', async () => {
    const source = `
      contract Test {
        function foo(address target) public returns (bool) {
          return (target.call(""));
        }
      }
    `;
    const findings = await plugin.analyze({
      contractName: 'Test',
      sourceCode: source,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.0',
      metadata: {},
    });
    expect(findings).toHaveLength(0); // Should now pass!
  });

  it('should not flag out-of-block checks for outer variables', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          bool success;
          if (true) {
            (success, ) = target.call("");
          }
          require(success);
        }
      }
    `;
    const findings = await plugin.analyze({
      contractName: 'Test',
      sourceCode: source,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.0',
      metadata: {},
    });
    expect(findings).toHaveLength(0); // Should now pass!
  });
});
