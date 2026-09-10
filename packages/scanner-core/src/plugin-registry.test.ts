import type { IRulePlugin, PluginMetadata } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDefaultRegistry, PluginRegistry } from './plugin-registry';

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
    initialize: async () =\u003e {
      // noop
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    analyze: async () =\u003e [],
    getFixRecommendation: () =\u003e 'No fix needed',
    supportsContext: (ctx) =\u003e chains.includes(ctx.chain) \u0026\u0026 languages.includes(ctx.language),
  };
}

describe('PluginRegistry', () =\u003e {
  let registry: PluginRegistry;

  beforeEach(() =\u003e {
    registry = new PluginRegistry();
  });

  it('should register a plugin', () =\u003e {
    const plugin = createMockPlugin('test-plugin');
    registry.register(plugin);
    expect(registry.size).toBe(1);
  });

  it('should retrieve a registered plugin', () =\u003e {
    const plugin = createMockPlugin('test-plugin');
    registry.register(plugin);
    expect(registry.get('test-plugin')).toBe(plugin);
  });

  it('should get plugins by chain', () =\u003e {
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

  it('should unregister a plugin', () =\u003e {
    const plugin = createMockPlugin('removable');
    registry.register(plugin);
    expect(registry.size).toBe(1);
    registry.unregister('removable');
    expect(registry.size).toBe(0);
  });

  it('should return all metadata', () =\u003e {
    registry.registerAll([createMockPlugin('a'), createMockPlugin('b')]);
    const allMeta = registry.getAllMetadata();
    expect(allMeta).toHaveLength(2);
  });

  it('should register only the unchecked-return default plugin', () =\u003e {
    registry.registerDefaultPlugins();
    expect(registry.get('unchecked-return')?.metadata.id).toBe('unchecked-return');
    expect(registry.get('unchecked-return')?.metadata.category).toBe('UNCHECKED_RETURN');
    expect(registry.get('reentrancy')).toBeUndefined();
    expect(registry.get('access-control')).toBeUndefined();
  });
});

describe('createDefaultRegistry', () =\u003e {
  it('should instantiate a registry with unchecked-return and no sibling plugins', () =\u003e {
    const defaultRegistry = createDefaultRegistry();
    expect(defaultRegistry.get('unchecked-return')).toBeDefined();
    expect(defaultRegistry.get('reentrancy')).toBeUndefined();
    expect(defaultRegistry.size).toBe(1);
  });
});
