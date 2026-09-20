import type { AnalysisContext, FindingResult } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { TimestampPlugin } from './index';

function ctx(sourceCode: string, language = 'solidity'): AnalysisContext {
  return {
    contractName: 'Auction',
    sourceCode,
    chain: 'ethereum',
    language,
    compilerVersion: null,
    metadata: {},
  };
}

describe('TimestampPlugin', () => {
  let plugin: TimestampPlugin;

  beforeEach(() => {
    plugin = new TimestampPlugin();
  });

  it('implements IRulePlugin metadata required by the issue', () => {
    expect(plugin.metadata.id).toBe('timestamp');
    expect(plugin.metadata.category).toBe('TIMESTAMP');
    expect(plugin.metadata.severity).toBe(FindingSeverity.LOW);
    expect(plugin.metadata.languages).toContain('solidity');
  });

  it('initializes', async () => {
    await expect(plugin.initialize()).resolves.toBeUndefined();
  });

  it('supports solidity only', () => {
    expect(plugin.supportsContext(ctx('contract C {}'))).toBe(true);
    expect(plugin.supportsContext(ctx('contract C {}', 'python'))).toBe(false);
  });

  it('detects block.timestamp in if conditions', async () => {
    const findings = await plugin.analyze(
      ctx('function bid() {\n  if (block.timestamp > deadline) {\n    revert();\n  }\n}'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('block.timestamp');
    expect(findings[0]?.severity).toBe(FindingSeverity.LOW);
    expect(findings[0]?.lineStart).toBe(2);
    expect(findings[0]?.pluginId).toBe('timestamp');
  });

  it('detects legacy now keyword in require', async () => {
    const findings = await plugin.analyze(ctx('function close() {\n  require(now < endTime);\n}'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('now');
    expect(findings[0]?.codeSnippet).toContain('now');
  });

  it('detects block.timestamp in while loops', async () => {
    const findings = await plugin.analyze(
      ctx('function spin() {\n  while (block.timestamp < unlock) {\n    // wait\n  }\n}'),
    );
    expect(findings).toHaveLength(1);
  });

  it('does not flag timestamp assignment outside conditionals', async () => {
    const findings = await plugin.analyze(
      ctx('function stamp() {\n  uint256 t = block.timestamp;\n  emit T(t);\n}'),
    );
    expect(findings).toHaveLength(0);
  });

  it('does not flag known identifiers that only contain now as a substring', async () => {
    const findings = await plugin.analyze(ctx('function ok() {\n  if (knownOwner == msg.sender) {}\n}'));
    expect(findings).toHaveLength(0);
  });

  it('ignores timestamp mentions inside comments', async () => {
    const findings = await plugin.analyze(
      ctx('function ok() {\n  // if (block.timestamp > 0) revert();\n  uint256 x = 1;\n}'),
    );
    expect(findings).toHaveLength(0);
  });

  it('returns the finding recommendation from getFixRecommendation', () => {
    const finding = {
      recommendation: 'Avoid timestamp checks for critical decisions.',
    } as FindingResult;
    expect(plugin.getFixRecommendation(finding)).toBe(finding.recommendation);
  });
});
