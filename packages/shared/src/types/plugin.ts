import type { FindingSeverity } from '../enums';

export interface RulePlugin {
  metadata: PluginMetadata;
  initialize(): Promise<void>;
  analyze(context: AnalysisContext): Promise<FindingResult[]>;
  getFixRecommendation(finding: FindingResult): string;
}

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
}

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

export interface AnalysisContext {
  contractName: string;
  sourceCode: string;
  ast: unknown;
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
