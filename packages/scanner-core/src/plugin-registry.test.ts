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
    expect(matching[0]?.metadata.id).toBe('eth');
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
});

describe('createDefaultRegistry', () => {
  it('should register unchecked-return plugin by default', () => {
    const registry = createDefaultRegistry();
    expect(registry.size).toBe(1);
    const plugin = registry.get('unchecked-return');
    expect(plugin).toBeDefined();
    expect(plugin?.metadata.id).toBe('unchecked-return');
    expect(plugin?.metadata.category).toBe('UNCHECKED_RETURN');
    expect(plugin?.metadata.severity).toBe(FindingSeverity.HIGH);
  });

  it('should list unchecked-return in all metadata', () => {
    const registry = createDefaultRegistry();
    const ids = registry.getAllMetadata().map((m) => m.id);
    expect(ids).toContain('unchecked-return');
  });

  it('should execute end-to-end scan through Scanner', async () => {
    const registry = createDefaultRegistry();
    const scanner = new Scanner(registry);
    const result = await scanner.scan({
      contractName: 'TestVault',
      sourceCode: `
contract TestVault {
    function withdraw(address payable recipient) public {
        recipient.call("");
    }
}`,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.20',
      metadata: {},
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.pluginId).toBe('unchecked-return');
    expect(result.findings[0]?.lineStart).toBe(4);
  });
});
