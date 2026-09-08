import type { IRulePlugin, PluginMetadata } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDefaultRegistry, PluginRegistry } from './plugin-registry';
import { Scanner } from './scanner';

function createMockPlugin(
  id: string,
  chains: string[] = ['ethereum'],
  languages: string[] = ['solidity'],
): IRulePlugin {
  const metadata: PluginMetadata = {
    id,
    name: `Test Plugin ${id}`,
    version: '1.0.0',
    description: 'Mock plugin for testing',
    severity: FindingSeverity.MEDIUM,
    category: 'CUSTOM',
    chains,
    languages,
    tags: ['test'],
  };

  return {
    metadata,
    initialize: async () => {
      // noop
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    analyze: async () => [],
    getFixRecommendation: () => 'No fix needed',
    supportsContext: (ctx) => chains.includes(ctx.chain) && languages.includes(ctx.language),
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('should register a plugin', () => {
    const plugin = createMockPlugin('test-plugin');
    registry.register(plugin);
    expect(registry.size).toBe(1);
  });

  it('should retrieve a registered plugin', () => {
    const plugin = createMockPlugin('test-plugin');
    registry.register(plugin);
    expect(registry.get('test-plugin')).toBe(plugin);
  });

  it('should get plugins by chain', () => {
    const ethPlugin = createMockPlugin('eth', ['ethereum']);
    const polyPlugin = createMockPlugin('poly', ['polygon']);
    registry.registerAll([ethPlugin, polyPlugin]);

    const matching = registry.getMatchingPlugins({
      contractName: 'Test',
      sourceCode: 'contract Test {}',
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: null,
      metadata: {},
    });

    expect(matching).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(matching[0]!.metadata.id).toBe('eth');
  });

  it('should unregister a plugin', () => {
    const plugin = createMockPlugin('removable');
    registry.register(plugin);
    expect(registry.size).toBe(1);
    registry.unregister('removable');
    expect(registry.size).toBe(0);
  });

  it('should return all metadata', () => {
    registry.registerAll([createMockPlugin('a'), createMockPlugin('b')]);
    const allMeta = registry.getAllMetadata();
    expect(allMeta).toHaveLength(2);
  });

  it('registers the bundled unchecked-return rule without changing custom registries', () => {
    expect(new PluginRegistry().size).toBe(0);
    expect(createDefaultRegistry().get('unchecked-return')?.metadata.category).toBe(
      'UNCHECKED_RETURN',
    );
  });

  it('runs the bundled rule through the real scanner', async () => {
    const scanner = new Scanner(createDefaultRegistry());
    const result = await scanner.scan({
      contractName: 'Example',
      sourceCode:
        'contract Example { function bad() external { target.send(1); } function good() external { require(target.send(1)); } }',
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.28',
      metadata: {},
    });
    expect(result.pluginCount).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.pluginId).toBe('unchecked-return');
    expect(result.summary.high).toBe(1);
  });
});
