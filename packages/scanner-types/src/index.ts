import type { FindingSeverity } from '@veridion/shared';

export type PluginCategory =
  | 'REENTRANCY'
  | 'ACCESS_CONTROL'
  | 'ARITHMETIC'
  | 'GAS'
  | 'RANDOMNESS'
  | 'ORACLE'
  | 'DOS'
  | 'TIMESTAMP'
  | 'FRONT_RUNNING'
  | 'SHORT_ADDRESS'
  | 'UNCHECKED_RETURN'
  | 'UNINITIALIZED_STORAGE'
  | 'UPGRADE'
  | 'CUSTOM';

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  severity: FindingSeverity;
  category: PluginCategory;
  chains: string[];
  languages: string[];
  tags: string[];
  author?: string;
  references?: string[];
}

export interface AnalysisContext {
  contractName: string;
  sourceCode: string;
  chain: string;
  language: string;
  compilerVersion: string | null;
  metadata: Record<string, unknown>;
}

export interface FindingResult {
  pluginId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  codeSnippet: string;
  recommendation: string;
  confidence: number;
  references: string[];
}

export interface IRulePlugin {
  readonly metadata: PluginMetadata;

  /**
   * Initialize the plugin with any configuration.
   * Called once when the plugin is registered.
   */
  initialize(config?: Record<string, unknown>): Promise<void>;

  /**
   * Analyze the contract source code for this specific vulnerability type.
   */
  analyze(context: AnalysisContext): Promise<FindingResult[]>;

  /**
   * Generate a fix recommendation for a specific finding.
   */
  getFixRecommendation(finding: FindingResult): string;

  /**
   * Validate that the plugin can handle the given context.
   */
  supportsContext(context: AnalysisContext): boolean;
}
