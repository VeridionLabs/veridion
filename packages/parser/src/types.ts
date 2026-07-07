export interface ParsedContract {
  name: string;
  sourceCode: string;
  language: string;
  functions: FunctionInfo[];
  stateVariables: StateVariableInfo[];
  modifiers: ModifierInfo[];
  events: EventInfo[];
  imports: ImportInfo[];
  inheritance: string[];
  compilerVersion: string | null;
  license: string | null;
}

export interface FunctionInfo {
  name: string;
  visibility: 'public' | 'external' | 'internal' | 'private';
  isPayable: boolean;
  isView: boolean;
  isPure: boolean;
  modifiers: string[];
  parameters: ParameterInfo[];
  returnTypes: string[];
  lineStart: number;
  lineEnd: number;
  body: string;
}

export interface StateVariableInfo {
  name: string;
  type: string;
  visibility: 'public' | 'internal' | 'private';
  isConstant: boolean;
  isImmutable: boolean;
  initialValue: string | null;
  lineNumber: number;
}

export interface ModifierInfo {
  name: string;
  parameters: ParameterInfo[];
  lineStart: number;
  lineEnd: number;
}

export interface EventInfo {
  name: string;
  parameters: ParameterInfo[];
  isIndexed: string[];
  lineNumber: number;
}

export interface ParameterInfo {
  name: string;
  type: string;
  isIndexed: boolean;
}

export interface ImportInfo {
  path: string;
  alias: string | null;
  symbols: string[] | null;
  lineNumber: number;
}
