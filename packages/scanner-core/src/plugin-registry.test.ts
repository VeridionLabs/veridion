import type { IRulePlugin, PluginMetadata } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { PluginRegistry } from './plugin-registry';

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

  describe('Plugin Configuration', () => {
    it('should register a plugin with optional configuration and retrieve it', () => {
      const plugin = createMockPlugin('configurable');
      registry.register(plugin, {
        enabled: true,
        severityOverride: FindingSeverity.CRITICAL,
        thresholds: { maxGas: 50000 },
      });

      const config = registry.getPluginConfig('configurable');
      expect(config).toBeDefined();
      expect(config?.enabled).toBe(true);
      expect(config?.severityOverride).toBe(FindingSeverity.CRITICAL);
      expect(config?.thresholds).toEqual({ maxGas: 50000 });
    });

    it('should return undefined when no configuration was set', () => {
      const plugin = createMockPlugin('unconfigured');
      registry.register(plugin);
      expect(registry.getPluginConfig('unconfigured')).toBeUndefined();
    });

    it('should allow updating plugin config with setPluginConfig', () => {
      const plugin = createMockPlugin('updateable');
      registry.register(plugin);
      expect(registry.getPluginConfig('updateable')).toBeUndefined();

      registry.setPluginConfig('updateable', { enabled: false });
      expect(registry.getPluginConfig('updateable')?.enabled).toBe(false);
    });

    it('should clean up config when plugin is unregistered', () => {
      const plugin = createMockPlugin('to-remove');
      registry.register(plugin, { enabled: true });
      expect(registry.getPluginConfig('to-remove')).toBeDefined();

      registry.unregister('to-remove');
      expect(registry.getPluginConfig('to-remove')).toBeUndefined();
    });

    it('should validate config against schema when schema is defined', () => {
      const pluginWithSchema: IRulePlugin = {
        ...createMockPlugin('schema-plugin'),
        metadata: {
          ...createMockPlugin('schema-plugin').metadata,
          configSchema: {
            maxDepth: { type: 'number', required: true },
            allowFallback: { type: 'boolean' },
          },
        },
      };

      // Valid config
      expect(() => {
        registry.register(pluginWithSchema, { maxDepth: 5, allowFallback: true });
      }).not.toThrow();

      // Missing required property
      expect(() => {
        registry.register(pluginWithSchema, { allowFallback: true });
      }).toThrow(/missing required property 'maxDepth'/);

      // Wrong type
      expect(() => {
        registry.register(pluginWithSchema, { maxDepth: 'not-a-number' as unknown as number });
      }).toThrow(/expected type 'number', got 'string'/);
    });
  });
});
