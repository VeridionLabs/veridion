import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const ELEMENTARY =
  /^(?:u?int(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?|u?fixed(?:\d+x\d+)?|bytes(?:[1-9]|[12]\d|3[0-2])?|byte|bool|address(?:\s+payable)?|string)$/;

const KEYWORDS = new Set([
  'function',
  'constructor',
  'modifier',
  'event',
  'error',
  'struct',
  'enum',
  'mapping',
  'if',
  'else',
  'for',
  'while',
  'do',
  'return',
  'require',
  'assert',
  'revert',
  'emit',
  'using',
  'import',
  'pragma',
  'contract',
  'interface',
  'library',
  'is',
  'public',
  'private',
  'internal',
  'external',
  'pure',
  'view',
  'payable',
  'constant',
  'immutable',
  'override',
  'virtual',
  'indexed',
  'anonymous',
  'memory',
  'storage',
  'calldata',
  'true',
  'false',
  'this',
  'super',
  'msg',
  'block',
  'tx',
  'abi',
  'type',
  'new',
  'delete',
  'assembly',
]);

const LOCATION = /\b(?:memory|storage|calldata)\b/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

interface Body {
  startLine: number;
  text: string;
}

function functionBodies(source: string): Body[] {
  const bodies: Body[] = [];
  const re = /\b(?:function|constructor|modifier)\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const brace = source.indexOf('{', match.index);
    if (brace < 0) continue;
    const between = source.slice(match.index, brace);
    if (between.includes(';')) continue;
    let depth = 0;
    let end = -1;
    for (let i = brace; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    bodies.push({
      startLine: source.slice(0, brace + 1).split('\n').length,
      text: source.slice(brace + 1, end),
    });
  }
  return bodies;
}

interface LocalRef {
  name: string;
  type: string;
  line: number;
  snippet: string;
}

function parseLocals(body: Body): LocalRef[] {
  const locals: LocalRef[] = [];
  const lines = body.text.split('\n');
  const decl =
    /^\s*(?:(?:public|private|internal|external|constant|immutable)\s+)*(mapping\b[\s\S]*?\)(?:\s*(?:public|private|internal|external))?\s+(\w+)\s*;|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)(\s*\[\s*\])?\s+(\w+)\s*;)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || LOCATION.test(line)) continue;
    const m = decl.exec(line);
    if (!m) continue;

    if (m[1]?.startsWith('mapping')) {
      const name = m[2];
      if (!name || KEYWORDS.has(name)) continue;
      locals.push({
        name,
        type: 'mapping',
        line: body.startLine + i,
        snippet: line.trim(),
      });
      continue;
    }

    const typeName = m[3];
    const isArray = Boolean(m[4]);
    const name = m[5];
    if (!typeName || !name || KEYWORDS.has(name) || KEYWORDS.has(typeName)) continue;
    const elementary = ELEMENTARY.test(typeName);
    if (elementary && !isArray) continue;

    locals.push({
      name,
      type: isArray ? `${typeName}[]` : typeName,
      line: body.startLine + i,
      snippet: line.trim(),
    });
  }
  return locals;
}

function assignmentFindings(
  body: Body,
  locals: LocalRef[],
  contractName: string,
): FindingResult[] {
  const findings: FindingResult[] = [];
  const lines = body.text.split('\n');
  const names = new Map(locals.map((l) => [l.name, l]));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const [name, local] of names) {
      const write = new RegExp(
        `\\b${name}\\s*(?:\\.[A-Za-z_]\\w*|\\[[^\\]]+\\])\\s*=`,
      );
      if (!write.test(line)) continue;
      if (body.startLine + i === local.line) continue;
      findings.push({
        pluginId: 'storage-pointer',
        title: `Assignment through uninitialized storage pointer '${name}'`,
        description:
          `Local ${local.type} '${name}' was declared without an explicit data location, so it aliases contract storage (typically slot 0). ` +
          'Writing through it can overwrite unrelated state.',
        severity: FindingSeverity.HIGH,
        filePath: `${contractName.replace(/\.sol$/i, '')}.sol`,
        lineStart: body.startLine + i,
        lineEnd: body.startLine + i,
        codeSnippet: line.trim(),
        recommendation:
          'Give the local an explicit data location (`memory` or `storage`) and, for storage, initialize it from a named state variable before any field writes.',
        confidence: 0.9,
        references: [
          'https://swcregistry.io/docs/SWC-109',
          'https://docs.soliditylang.org/en/latest/types.html#data-location',
        ],
      });
    }
  }
  return findings;
}

export class StoragePointerPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata = {
    id: 'storage-pointer',
    name: 'Uninitialized Storage Pointer Detector',
    version: '0.1.0',
    description:
      'Detects struct/array/mapping locals declared in functions without an explicit data location, and writes that can clobber unexpected storage slots.',
    severity: FindingSeverity.HIGH,
    category: 'UNINITIALIZED_STORAGE',
    chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
    languages: ['solidity'],
    tags: ['uninitialized-storage', 'storage-pointer', 'swc-109'],
    author: 'walterwagner',
    references: [
      'https://swcregistry.io/docs/SWC-109',
      'https://docs.soliditylang.org/en/latest/types.html#data-location',
    ],
  };

  async initialize(_config?: Record<string, unknown>): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const source = stripComments(context.sourceCode);
    const filePath = `${context.contractName.replace(/\.sol$/i, '')}.sol`;

    for (const body of functionBodies(source)) {
      const locals = parseLocals(body);
      for (const local of locals) {
        findings.push({
          pluginId: this.metadata.id,
          title: `Uninitialized ${local.type} storage pointer '${local.name}'`,
          description:
            `Local ${local.type} '${local.name}' is declared inside a function without \`memory\`, \`storage\`, or \`calldata\`. ` +
            'In Solidity this defaults to a storage pointer (often slot 0) and can corrupt unrelated state.',
          severity: FindingSeverity.HIGH,
          filePath,
          lineStart: local.line,
          lineEnd: local.line,
          codeSnippet: local.snippet,
          recommendation:
            'Add an explicit data location. Use `memory` for a fresh copy, or `storage` bound to a specific state variable (`MyStruct storage s = stateVar`).',
          confidence: 0.88,
          references: this.metadata.references ?? [],
        });
      }
      findings.push(...assignmentFindings(body, locals, context.contractName));
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return finding.recommendation;
  }

  supportsContext(context: AnalysisContext): boolean {
    return this.metadata.languages.includes(context.language);
  }
}
