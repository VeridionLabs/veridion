import type { IRulePlugin } from '@veridion/scanner-types';

import { PluginRegistry } from './plugin-registry';
import {
  AccessControlPlugin,
  DosPlugin,
  FrontRunningPlugin,
  GasPlugin,
  OraclePlugin,
  OverflowPlugin,
  RandomnessPlugin,
  ReentrancyPlugin,
  StoragePointerPlugin,
  UncheckedReturnPlugin,
} from './plugins';

/**
 * Default set of security detection plugins shipped with the scanner.
 *
 * Add new plugins here so they are picked up by
 * {@link createDefaultPluginRegistry} without any consumer-side wiring.
 */
export function createDefaultPlugins(): IRulePlugin[] {
  return [
    new ReentrancyPlugin(),
    new AccessControlPlugin(),
    new OverflowPlugin(),
    new UncheckedReturnPlugin(),
    new DosPlugin(),
    new GasPlugin(),
    new OraclePlugin(),
    new RandomnessPlugin(),
    new FrontRunningPlugin(),
    new StoragePointerPlugin(),
  ];
}

/**
 * Creates a {@link PluginRegistry} pre-registered with all default plugins.
 */
export function createDefaultPluginRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.registerAll(createDefaultPlugins());
  return registry;
}
