import { describe, it, expect } from 'vitest';
import type { IRulePlugin, PluginMetadata, AnalysisContext, FindingResult } from './index';
import { FindingSeverity } from '@veridion/shared';

describe('Scanner Types', () => {
  it('should allow valid PluginMetadata construction', () => {
    const meta: PluginMetadata = {
      id: 'test',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      severity: FindingSeverity.MEDIUM,
      category: 'CUSTOM',
      chains: ['ethereum'],
      languages: ['solidity'],
      tags: ['test'],
    };

    expect(meta.id).toBe('test');
  });

  it('should allow implementation of IRulePlugin', () => {
    class TestPlugin implements IRulePlugin {
      readonly metadata: PluginMetadata = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        severity: FindingSeverity.LOW,
        category: 'CUSTOM',
        chains: ['ethereum'],
        languages: ['solidity'],
        tags: ['test'],
      };

      async initialize() {}
      async analyze(_ctx: AnalysisContext): Promise<FindingResult[]> { return []; }
      getFixRecommendation(_: FindingResult): string { return ''; }
      supportsContext(ctx: AnalysisContext): boolean { return true; }
    }

    const plugin = new TestPlugin();
    expect(plugin.metadata.id).toBe('test');
  });
});
