import { logger } from '@veridion/logger';
import type {
  AnalysisContext,
  IRulePlugin,
  PluginConfig,
  PluginMetadata,
} from '@veridion/scanner-types';

export class PluginRegistry {
  private plugins = new Map<string, IRulePlugin>();
  private configs = new Map<string, PluginConfig>();

  register(plugin: IRulePlugin, config?: PluginConfig): void {
    if (this.plugins.has(plugin.metadata.id)) {
      logger.warn({ pluginId: plugin.metadata.id }, 'Plugin already registered, overwriting');
    }

    if (config) {
      this.validateConfig(plugin, config);
      this.configs.set(plugin.metadata.id, config);
    }

    this.plugins.set(plugin.metadata.id, plugin);
    logger.info(
      { pluginId: plugin.metadata.id, version: plugin.metadata.version },
      'Plugin registered',
    );
  }

  getPluginConfig(pluginId: string): PluginConfig | undefined {
    return this.configs.get(pluginId);
  }

  setPluginConfig(pluginId: string, config: PluginConfig): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      this.validateConfig(plugin, config);
    }
    this.configs.set(pluginId, config);
  }

  private validateConfig(plugin: IRulePlugin, config: PluginConfig): void {
    const schema = plugin.metadata.configSchema;
    if (!schema) return;

    for (const [key, propSchema] of Object.entries(schema)) {
      const val = config[key];
      if (propSchema.required && (val === undefined || val === null)) {
        throw new Error(
          `Configuration validation failed for plugin '${plugin.metadata.id}': missing required property '${key}'`,
        );
      }
      if (val !== undefined && val !== null) {
        const actualType = Array.isArray(val) ? 'array' : typeof val;
        if (actualType !== propSchema.type) {
          throw new Error(
            `Configuration validation failed for plugin '${plugin.metadata.id}': property '${key}' expected type '${propSchema.type}', got '${actualType}'`,
          );
        }
      }
    }
  }

  registerAll(plugins: IRulePlugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  unregister(pluginId: string): boolean {
    this.configs.delete(pluginId);
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
