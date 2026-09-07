import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

describe('UncheckedReturnPlugin', () => {
  let plugin: UncheckedReturnPlugin;

  beforeEach(() => {
    plugin = new UncheckedReturnPlugin();
  });

  const analyze = async (sourceCode: string) => {
    return plugin.analyze({
      contractName: 'Test',
      sourceCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.0',
      metadata: {},
    });
  };

  it('should flag unchecked call', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          target.call("");
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(4);
  });

  it('should flag unchecked send', async () => {
    const source = `
      contract Test {
        function foo(address payable target) public {
          target.send(100);
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(4);
  });

  it('should flag unchecked delegatecall', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          target.delegatecall("");
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
  });

  it('should not flag require(call)', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          require(target.call(""));
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should not flag require with message', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          require(target.call(""), "failed");
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should not flag checked single assignment', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          bool success = target.call("");
          require(success);
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should not flag checked tuple assignment', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          (bool success, bytes memory data) = target.call("");
          require(success, "failed");
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should flag unchecked single assignment', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          bool success = target.call("");
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
  });

  it('should flag ignored tuple assignment', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          (, bytes memory data) = target.call("");
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
  });

  it('should flag overwritten assignment', async () => {
    const source = `
      contract Test {
        function foo(address target1, address target2) public {
          (bool success, ) = target1.call(""); // this one is overwritten and thus unchecked
          (success, ) = target2.call("");
          require(success);
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(4);
  });

  it('should not flag return call', async () => {
    const source = `
      contract Test {
        function foo(address target) public returns (bool) {
          return target.call("");
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should not flag if call', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          if (!target.call("")) {
            revert();
          }
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should not flag assert call', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          assert(target.call(""));
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should properly ignore comments', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          // target.call("");
          /* target.call(""); */
          bool success = true; // target.call("");
          require(success);
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should properly ignore strings', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          string memory a = 'target.call("")';
          string memory b = "target.call('')";
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should correctly handle if (cond) call', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          if (true) 
            target.call(""); // unchecked
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.lineStart).toBe(5);
  });

  it('should handle nested function args', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          emit SomeEvent(target.call("")); // unchecked, as emit/events don't validate success natively
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
  });

  it('should handle call used as message', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          require(true, string(abi.encodePacked(target.call("")))); // weird but unchecked return val
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(1);
  });

  it('should not flag transfer', async () => {
    const source = `
      contract Test {
        function foo(address payable target) public {
          target.transfer(100);
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should provide fix recommendations', () => {
    const rec = plugin.getFixRecommendation({
      pluginId: plugin.metadata.id,
      title: 'Unchecked Return Value from .call()',
      description: '',
      severity: FindingSeverity.HIGH,
      filePath: 'Test.sol',
      lineStart: 10,
      lineEnd: 10,
      codeSnippet: 'target.call("");',
      recommendation: '',
      confidence: 0.9,
      references: [],
    });
    expect(rec).toContain('require(success');
    expect(rec).toContain('.call()');
  });

  it('should support correct context', () => {
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

    expect(
      plugin.supportsContext({
        contractName: 'Test',
        sourceCode: '',
        chain: 'unknown_chain',
        language: 'solidity',
        compilerVersion: null,
        metadata: {},
      }),
    ).toBe(false);

    expect(
      plugin.supportsContext({
        contractName: 'Test',
        sourceCode: '',
        chain: 'ethereum',
        language: 'vyper',
        compilerVersion: null,
        metadata: {},
      }),
    ).toBe(false);
  });

  it('should handle single var check correctly', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          (success, ) = target.call("");
          if (success) { }
        }
      }
    `;
    const findings = await analyze(source);
    expect(findings).toHaveLength(0);
  });

  it('should handle var checked in different scope', async () => {
    const source = `
      contract Test {
        function foo(address target) public {
          (success, ) = target.call("");
        }
        function bar() public {
          require(success);
        }
      }
    `;
    const findings = await analyze(source);
    // Since it's checked in a different function, it should be considered unchecked in foo.
    expect(findings).toHaveLength(1);
  });
});
