import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function filePathFor(contractName: string): string {
  return `${contractName.replace(/\.sol$/i, '')}.sol`;
}

const LENGTH_GUARD = /\b(?:msg\.data\.length|calldatasize)\b/;
const PACKED_SENDER = /abi\s*\.\s*encodePacked\s*\([^;]*\bmsg\.sender\b[^;]*\)/;
const PACKED_CALL =
  /abi\s*\.\s*encodePacked\s*\([^;]*\)[\s\S]{0,80}\.(?:call|delegatecall|staticcall)\s*(?:\{[^}]*\})?\s*\(/;

interface Fn {
  header: string;
  body: string;
  headerLine: number;
}

function extractFunctions(source: string): Fn[] {
  const out: Fn[] = [];
  const re = /\bfunction\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const brace = source.indexOf('{', match.index);
    const semi = source.indexOf(';', match.index);
    if (brace < 0 || (semi >= 0 && semi < brace)) continue;
    const header = source.slice(match.index, brace);
    let depth = 0;
    let end = -1;
    for (let i = brace; i < source.length; i++) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    out.push({
      header,
      body: source.slice(brace + 1, end),
      headerLine: source.slice(0, match.index).split('\n').length,
    });
  }
  return out;
}

function isExternalOrPublic(header: string): boolean {
  return /\b(?:external|public)\b/.test(header);
}

function addressThenOtherParams(header: string): boolean {
  const open = header.indexOf('(');
  const close = header.indexOf(')');
  if (open < 0 || close < 0 || close <= open) return false;
  const params = header.slice(open + 1, close);
  if (!params.trim()) return false;
  const parts = params.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  const addrIdx = parts.findIndex((p) => /\baddress(?:\s+payable)?\b/.test(p));
  return addrIdx >= 0 && addrIdx < parts.length - 1;
}

export class ShortAddressPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata = {
    id: 'short-address',
    name: 'Short Address Attack Detector',
    version: '0.1.0',
    description:
      'Detects msg.sender packed into ABI call data without padding checks, and external functions that take an address plus later arguments without validating calldata length.',
    severity: FindingSeverity.MEDIUM,
    category: 'SHORT_ADDRESS',
    chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
    languages: ['solidity'],
    tags: ['short-address', 'calldata', 'abi-encodePacked', 'msg.sender'],
    author: 'walterwagner',
    references: [
      'https://swcregistry.io/docs/SWC-133',
      'https://blog.openzeppelin.com/introducing-ethernaut-ctf-and-the-short-address-attack',
    ],
  };

  async initialize(_config?: Record<string, unknown>): Promise<void> {}

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];
    const source = stripComments(context.sourceCode);
    const filePath = filePathFor(context.contractName);
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const window = lines.slice(i, i + 3).join('\n');
      if (PACKED_SENDER.test(window) || PACKED_CALL.test(window)) {
        const nearby = lines.slice(Math.max(0, i - 6), i + 6).join('\n');
        if (LENGTH_GUARD.test(nearby)) continue;
        findings.push({
          pluginId: this.metadata.id,
          title: 'ABI-packed address in call data without padding validation',
          description:
            'Addresses packed via abi.encodePacked (including msg.sender) into subsequent call data can be truncated. A short address shifts later arguments unless calldata length is checked.',
          severity: FindingSeverity.MEDIUM,
          filePath,
          lineStart: i + 1,
          lineEnd: i + 1,
          codeSnippet: line.trim(),
          recommendation:
            'Use abi.encode (32-byte padding) instead of encodePacked for addresses, and require(msg.data.length == expected) / calldatasize checks before decoding.',
          confidence: 0.82,
          references: this.metadata.references ?? [],
        });
      }
    }

    for (const fn of extractFunctions(source)) {
      if (!isExternalOrPublic(fn.header)) continue;
      if (!addressThenOtherParams(fn.header)) continue;
      if (LENGTH_GUARD.test(fn.body) || LENGTH_GUARD.test(fn.header)) continue;
      findings.push({
        pluginId: this.metadata.id,
        title: 'External function takes address plus later args without calldata length check',
        description:
          'Public/external functions that accept an address followed by other parameters are the classic short-address surface: truncated calldata lets the address steal bits from the next argument. No msg.data.length / calldatasize guard was found.',
        severity: FindingSeverity.MEDIUM,
        filePath,
        lineStart: fn.headerLine,
        lineEnd: fn.headerLine,
        codeSnippet: fn.header.replace(/\s+/g, ' ').trim().slice(0, 180),
        recommendation:
          'Add `require(msg.data.length >= 4 + 32 * n)` (or an equivalent calldatasize check) before using address + integer arguments, or consume arguments via abi.decode of the full calldata.',
        confidence: 0.75,
        references: this.metadata.references ?? [],
      });
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
