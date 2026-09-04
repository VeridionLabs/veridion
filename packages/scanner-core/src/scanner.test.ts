import type { AnalysisContext, FindingResult, IRulePlugin, PluginMetadata } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { PluginRegistry } from './plugin-registry';
import { Scanner } from './scanner';

function createMockFinding(pluginId: string, title: string, snippet: string): FindingResult {
  return {
    pluginId,
    title,
    description: 'Mock finding',
    severity: FindingSeverity.MEDIUM,
    filePath: 'Test.sol',
    lineStart: 1,
    lineEnd: 2,
    codeSnippet: snippet,
    recommendation: 'Fix it',
    confidence: 0.8,
    references: [],
  };
}

function createMockPlugin(id: string, findings: FindingResult[]): IRulePlugin {
  const metadata: PluginMetadata = {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: 'Mock',
    severity: FindingSeverity.MEDIUM,
    category: 'CUSTOM',
    chains: ['ethereum'],
    languages: ['solidity'],
    tags: ['test'],
  };

  return {
    metadata,
    initialize: async () => {},
    // eslint-disable-next-line @typescript-eslint/require-await
    analyze: async () => findings,
    getFixRecommendation: () => 'Fix',
    supportsContext: () => true,
  };
}

describe('Scanner with Plugin Configuration', () => {
  let registry: PluginRegistry;
  let context: AnalysisContext;

  beforeEach(() => {
    registry = new PluginRegistry();
    context = {
      contractName: 'Vault',
      sourceCode: 'contract Vault {}',
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: null,
      metadata: {},
    };
  });

  it('should run plugin without config by default', async () => {
    const findings = [createMockFinding('test-plugin', 'Issue 1', 'call()')];
    registry.register(createMockPlugin('test-plugin', findings));

    const scanner = new Scanner(registry);
    const result = await scanner.scan(context);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe(FindingSeverity.MEDIUM);
  });

  it('should override severity of findings when severityOverride is configured', async () => {
    const findings = [createMockFinding('test-plugin', 'Issue 1', 'call()')];
    registry.register(createMockPlugin('test-plugin', findings), {
      severityOverride: FindingSeverity.CRITICAL,
    });

    const scanner = new Scanner(registry);
    const result = await scanner.scan(context);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe(FindingSeverity.CRITICAL);
    expect(result.summary.critical).toBe(1);
    expect(result.summary.medium).toBe(0);
  });

  it('should filter out findings matching disabledPatterns', async () => {
    const findings = [
      createMockFinding('multi-pattern', 'Timestamp equality check', 'block.timestamp == target'),
      createMockFinding('multi-pattern', 'Timestamp interval check', 'block.timestamp > deadline'),
      createMockFinding('multi-pattern', 'Unrelated check', 'msg.sender == owner'),
    ];

    registry.register(createMockPlugin('multi-pattern', findings), {
      disabledPatterns: ['interval', 'msg.sender'],
    });

    const scanner = new Scanner(registry);
    const result = await scanner.scan(context);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe('Timestamp equality check');
  });

  it('should skip plugin when enabled is false in config', async () => {
    const findings = [createMockFinding('disabled-plugin', 'Should not appear', 'xyz')];
    registry.register(createMockPlugin('disabled-plugin', findings), {
      enabled: false,
    });

    const scanner = new Scanner(registry);
    const result = await scanner.scan(context);

    expect(result.findings).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });
});
