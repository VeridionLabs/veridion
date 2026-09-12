import { logger } from '@veridion/logger';
import type { AnalysisContext, IRulePlugin, PluginMetadata } from '@veridion/scanner-types';

/**
 * Built-in plugins shipped with the scanner, keyed by plugin id.
 *
 * Each entry stores a module specifier instead of being a static `import`,
 * so that `scanner-core` keeps zero compile-time knowledge of plugin
 * implementations (see ARCHITECTURE.md: "Scanner-core has zero knowledge of
 * individual plugins"). At runtime the module is loaded dynamically and every
 * export that satisfies {@link IRulePlugin} is instantiated.
 */
export const BUILTIN_PLUGIN_SPECIFIERS: Readonly<Record<string, string>> = {
  'unchecked-return': '@veridion/plugin-unchecked-return',
};

function isRulePlugin(value: unknown): value is IRulePlugin {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<IRulePlugin>;
  return (
    typeof candidate.metadata?.id === 'string' &&
    typeof candidate.initialize === 'function' &&
    typeof candidate.analyze === 'function' &&
    typeof candidate.getFixRecommendation === 'function' &&
    typeof candidate.supportsContext === 'function'
  );
}

/**
 * Turn a single module export into a plugin instance. Plugins are shipped as
 * a class (constructor), but an already-instantiated object is also accepted.
 */
function tryInstantiate(exportedValue: unknown): IRulePlugin | null {
  if (isRulePlugin(exportedValue)) return exportedValue;

  if (typeof exportedValue === 'function') {
    try {
      const instance: unknown = new (exportedValue as new () => unknown)();
      if (isRulePlugin(instance)) return instance;
    } catch {
      // Not a constructable plugin class; ignore this export.
    }
  }

  return null;
}

/**
 * Dynamically import every built-in plugin and instantiate it.
 *
 * A failure to resolve a module (for example because the plugin package has
 * not been declared as a dependency of the consuming package) is logged and
 * skipped, so this call never throws.
 */
export async function loadBuiltinPlugins(): Promise<IRulePlugin[]> {
  const plugins: IRulePlugin[] = [];

  for (const [pluginId, specifier] of Object.entries(BUILTIN_PLUGIN_SPECIFIERS)) {
    try {
      const namespace = (await import(/* webpackIgnore: true */ specifier)) as unknown;
      const exports = Object.values(namespace as Record<string, unknown>);
      for (const exportedValue of exports) {
        const instance = tryInstantiate(exportedValue);
        if (instance !== null) plugins.push(instance);
      }
    } catch (error) {
      logger.warn(
        { pluginId, specifier, err: error instanceof Error ? error.message : String(error) },
        'Built-in plugin could not be loaded; install the matching workspace package to enable it',
      );
    }
  }

  return plugins;
}

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

  /**
   * Register every plugin returned by {@link loadBuiltinPlugins}.
   *
   * Newly-loaded plugins that were not previously registered are added;
   * plugins already in the registry are left untouched (use {@link register}
   * to overwrite).
   */
  async registerBuiltins(): Promise<IRulePlugin[]> {
    const loaded = await loadBuiltinPlugins();
    const added: IRulePlugin[] = [];
    for (const plugin of loaded) {
      if (!this.plugins.has(plugin.metadata.id)) {
        this.register(plugin);
        added.push(plugin);
      }
    }
    return added;
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
