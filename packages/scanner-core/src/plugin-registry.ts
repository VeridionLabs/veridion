import { logger } from '@veridion/logger';
import type { AnalysisContext, IRulePlugin, PluginMetadata } from '@veridion/scanner-types';

export class PluginRegistry {
  private plugins = new Map<string, IRulePlugin>();

  register(plugin: IRulePlugin): void {
    if (this.plugins.has(plugin.metadata.id)) {
      logger.warn({ pluginId: plugin.metadata.id }, 'Plugin already registered, overwriting');
    }
    this.plugins.set(plugin.metadata.id, plugin);
    logger.info(
      { pluginId: plugin.metadata.id, version: plugin.metadata.version },
      'Plugin registered',
    );
  }

  registerAll(plugins: IRulePlugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  unregister(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }

  get(pluginId: string): IRulePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAll(): IRulePlugin[] {
    return Array.from(this.plugins.values());
  }

  getByCategory(category: string): IRulePlugin[] {
    return this.getAll().filter(
      (p) => p.metadata.category === (category as PluginMetadata['category']),
    );
  }

  getBySeverity(severity: string): IRulePlugin[] {
    return this.getAll().filter(
      (p) => p.metadata.severity === (severity as PluginMetadata['severity']),
    );
  }

  getByChain(chain: string): IRulePlugin[] {
    return this.getAll().filter((p) =>
      p.supportsContext({
        contractName: '',
        sourceCode: '',
        chain,
        language: '',
        compilerVersion: null,
        metadata: {},
      }),
    );
  }

  getMatchingPlugins(context: AnalysisContext): IRulePlugin[] {
    return this.getAll().filter((p) => p.supportsContext(context));
  }

  getAllMetadata(): PluginMetadata[] {
    return this.getAll().map((p) => ({ ...p.metadata }));
  }

  get size(): number {
    return this.plugins.size;
  }
}
