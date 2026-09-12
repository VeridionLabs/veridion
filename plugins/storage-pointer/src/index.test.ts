import type { AnalysisContext } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { StoragePointerPlugin } from './index';

function ctx(sourceCode: string, language = 'solidity'): AnalysisContext {
  return {
    contractName: 'Vault',
    sourceCode,
    chain: 'ethereum',
    language,
    compilerVersion: null,
    metadata: {},
  };
}

describe('StoragePointerPlugin', () => {
  let plugin: StoragePointerPlugin;

  beforeEach(() => {
    plugin = new StoragePointerPlugin();
  });

  it('implements IRulePlugin metadata required by the issue', () => {
    expect(plugin.metadata.id).toBe('storage-pointer');
    expect(plugin.metadata.category).toBe('UNINITIALIZED_STORAGE');
    expect(plugin.metadata.severity).toBe(FindingSeverity.HIGH);
    expect(plugin.metadata.languages).toContain('solidity');
  });

  it('initializes', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
  });

  it('supports solidity only', () => {
    expect(plugin.supportsContext(ctx('contract C {}'))).toBe(true);
    expect(plugin.supportsContext(ctx('contract C {}', 'python'))).toBe(false);
  });

  it('detects struct locals declared without a data location', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Vault {
  struct Record { uint256 amount; }
  uint256 public slot0;
  function bump() public {
    Record r;
    r.amount = 1;
  }
}`),
    );
    const decl = findings.filter((f) => f.title.includes("storage pointer 'r'"));
    const write = findings.filter((f) => f.title.startsWith('Assignment'));
    expect(decl.length).toBeGreaterThanOrEqual(1);
    expect(write.length).toBeGreaterThanOrEqual(1);
    expect(decl[0]?.severity).toBe(FindingSeverity.HIGH);
    expect(decl[0]?.codeSnippet).toContain('Record r');
    expect(write[0]?.codeSnippet).toContain('r.amount');
    expect(plugin.getFixRecommendation(decl[0]!)).toContain('explicit data location');
  });

  it('detects array locals declared without a data location', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Vault {
  function push() public {
    uint256[] values;
    values.push(1);
  }
}`),
    );
    expect(findings.some((f) => f.title.includes('uint256[]'))).toBe(true);
  });

  it('detects mapping locals declared in a function', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Vault {
  function index() public {
    mapping(address => uint256) balances;
    balances[msg.sender] = 1;
  }
}`),
    );
    expect(findings.some((f) => f.title.includes('mapping'))).toBe(true);
    expect(findings.some((f) => f.title.startsWith('Assignment'))).toBe(true);
  });

  it('does not flag locals that already have memory or storage', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Vault {
  struct Record { uint256 amount; }
  Record public stored;
  function ok() public {
    Record memory r;
    Record storage s = stored;
    r.amount = 1;
    s.amount = 2;
  }
}`),
    );
    expect(findings).toHaveLength(0);
  });

  it('does not flag elementary value types or contract-level state', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Vault {
  struct Record { uint256 amount; }
  Record public stored;
  uint256 public total;
  function ok() public {
    uint256 x;
    address a;
    bool flag;
    x = 1;
  }
}`),
    );
    expect(findings).toHaveLength(0);
  });

  it('ignores uninitialized pointers mentioned only in comments', async () => {
    const findings = await plugin.analyze(
      ctx(`contract Vault {
  struct Record { uint256 amount; }
  function ok() public {
    // Record r;
    // r.amount = 1;
    uint256 x = 1;
  }
}`),
    );
    expect(findings).toHaveLength(0);
  });
});
