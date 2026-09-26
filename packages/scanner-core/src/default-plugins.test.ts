import { describe, expect, it } from 'vitest';

import { createDefaultPluginRegistry, createDefaultPlugins } from './default-plugins';

describe('default plugins', () => {
  it('should include all bundled plugins with unique ids', () => {
    const plugins = createDefaultPlugins();
    const ids = plugins.map((p) => p.metadata.id);

    expect(ids).toContain('reentrancy');
    expect(ids).toContain('access-control');
    expect(ids).toContain('overflow');
    expect(ids).toContain('unchecked-return');
    expect(ids).toContain('dos');
    expect(ids).toContain('gas');
    expect(ids).toContain('oracle');
    expect(ids).toContain('randomness');
    expect(ids).toContain('front-running');
    expect(ids).toContain('storage-pointer');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should create a fresh plugin instance list on each call', () => {
    const [first] = createDefaultPlugins();
    const [second] = createDefaultPlugins();

    expect(first).not.toBe(second);
    expect(first?.metadata.id).toBe(second?.metadata.id);
  });

  it('should create a registry pre-registered with all default plugins', () => {
    const registry = createDefaultPluginRegistry();

    expect(registry.size).toBe(createDefaultPlugins().length);
    expect(registry.get('unchecked-return')).toBeDefined();
    expect(registry.get('reentrancy')).toBeDefined();
    expect(registry.get('front-running')).toBeDefined();
  });

  it('should expose all default plugins through registry metadata', () => {
    const registry = createDefaultPluginRegistry();
    const ids = registry.getAllMetadata().map((m) => m.id);

    expect(ids).toContain('unchecked-return');
    expect(registry.get('unchecked-return')?.metadata.category).toBe('UNCHECKED_RETURN');
  });
});
