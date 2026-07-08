import { logger } from '@veridion/logger';

import type { ParsedContract } from './types';

export class SolidityParser {
  parse(sourceCode: string, contractName: string): ParsedContract {
    logger.debug({ contractName }, 'Parsing Solidity contract');

    const functions = this.extractFunctions(sourceCode);
    const stateVariables = this.extractStateVariables(sourceCode);
    const modifiers = this.extractModifiers(sourceCode);
    const events = this.extractEvents(sourceCode);
    const imports = this.extractImports(sourceCode);
    const inheritance = this.extractInheritance(sourceCode, contractName);
    const compilerVersion = this.extractCompilerVersion(sourceCode);
    const license = this.extractLicense(sourceCode);

    return {
      name: contractName,
      sourceCode,
      language: 'solidity',
      functions,
      stateVariables,
      modifiers,
      events,
      imports,
      inheritance,
      compilerVersion,
      license,
    };
  }

  private extractFunctions(sourceCode: string): ParsedContract['functions'] {
    const functions: ParsedContract['functions'] = [];
    const regex = /function\s+(\w+)\s*\(([^)]*)\)[^{]*\{/g;
    let match;

    while ((match = regex.exec(sourceCode)) !== null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const name = match[1]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const params = match[2] ?? '';
      functions.push({
        name,
        visibility: 'public',
        isPayable: false,
        isView: false,
        isPure: false,
        modifiers: [],
        parameters: this.parseParameters(params),
        returnTypes: [],
        lineStart: 0,
        lineEnd: 0,
        body: '',
      });
    }

    return functions;
  }

  private extractStateVariables(sourceCode: string): ParsedContract['stateVariables'] {
    const variables: ParsedContract['stateVariables'] = [];
    const regex =
      /(?:uint|int|bool|address|bytes|string|mapping)\s*(?:\(\s*[\w]+\s*(?:=>|,)\s*[\w[\]]+\s*\))?\s+(?:public\s+|internal\s+|private\s+)?(\w+)/gi;
    let match;

    while ((match = regex.exec(sourceCode)) !== null) {
      variables.push({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        name: match[1]!,
        type: match[0].replace(/\s+\w+$/, ''),
        visibility: 'internal',
        isConstant: false,
        isImmutable: false,
        initialValue: null,
        lineNumber: 0,
      });
    }

    return variables;
  }

  private extractModifiers(sourceCode: string): ParsedContract['modifiers'] {
    const modifiers: ParsedContract['modifiers'] = [];
    const regex = /modifier\s+(\w+)\s*\(([^)]*)\)/g;
    let match;

    while ((match = regex.exec(sourceCode)) !== null) {
      modifiers.push({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        name: match[1]!,
        parameters: this.parseParameters(match[2] ?? ''),
        lineStart: 0,
        lineEnd: 0,
      });
    }

    return modifiers;
  }

  private extractEvents(sourceCode: string): ParsedContract['events'] {
    const events: ParsedContract['events'] = [];
    const regex = /event\s+(\w+)\s*\(([^)]*)\)/g;
    let match;

    while ((match = regex.exec(sourceCode)) !== null) {
      events.push({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        name: match[1]!,
        parameters: this.parseParameters(match[2] ?? ''),
        isIndexed: [],
        lineNumber: 0,
      });
    }

    return events;
  }

  private extractImports(sourceCode: string): ParsedContract['imports'] {
    const imports: ParsedContract['imports'] = [];
    const regex = /import\s+(?:\{([^}]+)\}\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;

    while ((match = regex.exec(sourceCode)) !== null) {
      const symbolsStr = match[1];
      imports.push({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        path: match[2]!,
        alias: null,
        symbols: symbolsStr ? symbolsStr.split(',').map((s) => s.trim()) : null,
        lineNumber: 0,
      });
    }

    return imports;
  }

  private extractInheritance(sourceCode: string, contractName: string): string[] {
    const regex = new RegExp(`contract\\s+${contractName}\\s+is\\s+([^{]+)`);
    const match = regex.exec(sourceCode);
    if (!match?.[1]) return [];
    return match[1].split(',').map((s) => s.trim());
  }

  private extractCompilerVersion(sourceCode: string): string | null {
    const match = /\bpragma\s+solidity\s+([^;]+)/.exec(sourceCode);
    return match?.[1]?.trim() ?? null;
  }

  private extractLicense(sourceCode: string): string | null {
    const match = /\/\/\s*SPDX-License-Identifier:\s*([^\n]+)/.exec(sourceCode);
    return match?.[1]?.trim() ?? null;
  }

  private parseParameters(paramsStr: string): ParsedContract['functions'][0]['parameters'] {
    if (!paramsStr.trim()) return [];
    return paramsStr.split(',').map((param) => {
      const parts = param.trim().split(/\s+/);
      const type = parts.slice(0, -1).join(' ');
      const name = parts[parts.length - 1] ?? '';
      return { name, type: type || name, isIndexed: false };
    });
  }
}
