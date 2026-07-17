# Plugin Development Guide

This guide covers everything you need to know to build a security detection plugin for the Veridion scanner.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Plugin Structure](#plugin-structure)
- [Core Interfaces](#core-interfaces)
  - [IRulePlugin](#iruleplugin)
  - [PluginMetadata](#pluginmetadata)
  - [AnalysisContext](#analysiscontext)
  - [FindingResult](#findingresult)
- [Step-by-Step Guide](#step-by-step-guide)
- [Testing Your Plugin](#testing-your-plugin)
- [Registering Your Plugin](#registering-your-plugin)
- [Best Practices](#best-practices)
- [Reference Plugins](#reference-plugins)

---

## Overview

Veridion uses a **plugin-based architecture** for security scanning. Each plugin is an independent, self-contained module that detects a specific vulnerability pattern. Plugins have **zero knowledge of the scanner engine** — they only implement the `IRulePlugin` interface from `@veridion/scanner-types`.

This design means:

- No changes to `scanner-core` are required when adding a new plugin
- Plugins are independently testable
- Plugins can be developed and published separately
- Users can enable/disable specific plugins as needed

## Architecture

```
@veridion/scanner-types         (interfaces & types)
    ↑
    │  implements IRulePlugin
    │
plugins/*                        (your plugin)
    ↑
    │  registered with
    │
PluginRegistry ──── Scanner ──── ResultAggregator
```

The **Scanner** asks the **PluginRegistry** for plugins matching the current `AnalysisContext` (chain + language). Each matching plugin's `analyze()` method is called, and all `FindingResult[]` outputs are aggregated into a final scan report.

## Plugin Structure

A minimal plugin requires these files:

```
plugins/my-plugin/
├── package.json          # Package metadata & dependencies
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Test runner configuration
├── .eslintrc.js          # Linting configuration
└── src/
    ├── index.ts          # Plugin implementation
    └── index.test.ts     # Unit tests
```

### package.json

```json
{
  "name": "@veridion/plugin-my-plugin",
  "version": "0.1.0",
  "private": true,
  "description": "My vulnerability detection plugin",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@veridion/scanner-types": "workspace:*",
    "@veridion/shared": "workspace:*",
    "@veridion/logger": "workspace:*"
  },
  "devDependencies": {
    "@veridion/eslint-config": "workspace:*",
    "@veridion/tsconfig": "workspace:*",
    "eslint": "^8.57.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

### tsconfig.json

```json
{
  "extends": "@veridion/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

### .eslintrc.js

```js
module.exports = {
  root: true,
  extends: ['@veridion/eslint-config/base'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
```

---

## Core Interfaces

### IRulePlugin

Every plugin must implement the `IRulePlugin` interface defined in `@veridion/scanner-types`:

```ts
interface IRulePlugin {
  readonly metadata: PluginMetadata;

  initialize(config?: Record<string, unknown>): Promise<void>;

  analyze(context: AnalysisContext): Promise<FindingResult[]>;

  getFixRecommendation(finding: FindingResult): string;

  supportsContext(context: AnalysisContext): boolean;
}
```

#### `metadata` (required, readonly)

Static information about your plugin used for discovery, filtering, and reporting. Must be a plain object — do not compute it dynamically.

```ts
readonly metadata: PluginMetadata;
```

#### `initialize(config?)` (required)

Called once when the plugin is registered. Use this for any async setup like loading configuration, fetching external data, or initializing helper structures.

```ts
async initialize(config?: Record<string, unknown>): Promise<void> {
  // e.g., load a wordlist, validate config, etc.
}
```

If you don't need initialization, just return an empty async function:

```ts
async initialize(): Promise<void> {
  // noop
}
```

#### `analyze(context)` (required)

The core of your plugin. Receives the contract source code and metadata, and returns an array of findings (or empty array if nothing is detected).

```ts
async analyze(context: AnalysisContext): Promise<FindingResult[]> {
  const findings: FindingResult[] = [];

  // Your detection logic here...

  return findings;
}
```

> **Note:** If your plugin is synchronous (no I/O or async operations), you can add the ESLint comment `// eslint-disable-next-line @typescript-eslint/require-await` and keep the `async` keyword — the interface requires it.

#### `getFixRecommendation(finding)` (required)

Returns a human-readable string with fix recommendations for a specific finding. Use this to provide actionable guidance to the developer.

```ts
getFixRecommendation(finding: FindingResult): string {
  return `To fix ${finding.title}:\n1. Step one\n2. Step two`;
}
```

#### `supportsContext(context)` (required)

Determines whether your plugin can analyze the given contract context. Typically checks the chain and language against your plugin's `metadata.chains` and `metadata.languages`.

```ts
supportsContext(context: AnalysisContext): boolean {
  return (
    this.metadata.chains.includes(context.chain) &&
    this.metadata.languages.includes(context.language)
  );
}
```

### PluginMetadata

```ts
interface PluginMetadata {
  id: string;           // Unique identifier (e.g., 'reentrancy', 'access-control')
  name: string;         // Human-readable display name
  version: string;      // Semantic version (e.g., '1.0.0')
  description: string;  // What the plugin detects
  severity: FindingSeverity;  // Default severity for findings
  category: PluginCategory;   // Vulnerability category
  chains: string[];     // Supported blockchains (e.g., 'ethereum', 'polygon')
  languages: string[];  // Supported languages (e.g., 'solidity', 'vyper')
  tags: string[];       // Search tags for discoverability
  author?: string;      // Plugin author name
  references?: string[];// References (SWC registry, best practices, CWE, etc.)
}
```

#### Fields Explained

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Short, unique identifier. Use kebab-case. Must match the plugin directory name. |
| `name` | `string` | Yes | Display name shown in UI and reports. |
| `version` | `string` | Yes | Semantic version. Update when making changes to detection logic. |
| `description` | `string` | Yes | Short description of what vulnerability the plugin detects. |
| `severity` | `FindingSeverity` | Yes | Default severity assigned to findings. Choose from: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `GAS`, `INFORMATIONAL`. |
| `category` | `PluginCategory` | Yes | Vulnerability category. Choose from the predefined list or use `CUSTOM`. |
| `chains` | `string[]` | Yes | List of supported blockchain networks. Common values: `ethereum`, `polygon`, `bsc`, `avalanche`, `arbitrum`, `optimism`. |
| `languages` | `string[]` | Yes | List of supported smart contract languages. Common values: `solidity`, `vyper`. |
| `tags` | `string[]` | Yes | Searchable keywords for plugin discovery. |
| `author` | `string` | No | Your name or organization. |
| `references` | `string[]` | No | External links to vulnerability documentation (SWC registry, CWE, etc.). |

#### FindingSeverity

Available severity levels from `@veridion/shared`:

```ts
enum FindingSeverity {
  CRITICAL = 'CRITICAL',       // Direct loss of funds, no preconditions
  HIGH = 'HIGH',               // Potential loss of funds with some preconditions
  MEDIUM = 'MEDIUM',           // Indirect risk, requires specific circumstances
  LOW = 'LOW',                 // Minor issues, best practice violations
  GAS = 'GAS',                 // Gas optimization suggestions
  INFORMATIONAL = 'INFORMATIONAL', // Informational notes
}
```

#### PluginCategory

Available categories:

```ts
type PluginCategory =
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
```

Use `CUSTOM` if none of the predefined categories fit your plugin.

### AnalysisContext

The `AnalysisContext` is passed to `analyze()` and `supportsContext()`. It provides the data your plugin needs to inspect:

```ts
interface AnalysisContext {
  contractName: string;           // Name of the contract being analyzed
  sourceCode: string;             // Full source code of the contract
  chain: string;                  // Blockchain network (e.g., 'ethereum', 'polygon')
  language: string;               // Programming language (e.g., 'solidity', 'vyper')
  compilerVersion: string | null; // Solidity/Vyper compiler version
  metadata: Record<string, unknown>; // Additional context (future extensibility)
}
```

| Field | Description | Common Values |
|-------|-------------|---------------|
| `contractName` | Name of the contract | `'Token'`, `'Vault'`, `'DAO'` |
| `sourceCode` | Complete source code as a string | Full Solidity/Vyper code |
| `chain` | Target blockchain | `'ethereum'`, `'polygon'`, `'bsc'`, `'avalanche'`, `'arbitrum'`, `'optimism'` |
| `language` | Smart contract language | `'solidity'`, `'vyper'` |
| `compilerVersion` | Solidity or Vyper compiler version | `'0.8.19'`, `'0.8.24'`, `null` |
| `metadata` | Extensible metadata object | Any key-value pairs for future use |

### FindingResult

Each detected vulnerability should be returned as a `FindingResult`:

```ts
interface FindingResult {
  pluginId: string;       // Must match your metadata.id
  title: string;          // Short title (e.g., "Reentrancy in withdraw()")
  description: string;    // Detailed explanation of the vulnerability
  severity: FindingSeverity; // Severity level for this specific finding
  filePath: string;       // File where the issue was found
  lineStart: number;      // Starting line number (1-based)
  lineEnd: number;        // Ending line number (1-based)
  codeSnippet: string;    // The relevant code fragment
  recommendation: string; // How to fix the issue
  confidence: number;     // Detection confidence (0.0 to 1.0)
  references: string[];   // External documentation links
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pluginId` | `string` | Your plugin's ID. Use `this.metadata.id`. |
| `title` | `string` | Brief label. Be specific about what and where. |
| `description` | `string` | Explain the vulnerability, its impact, and the attack vector. |
| `severity` | `FindingSeverity` | Can differ from `metadata.severity` for per-finding granularity. |
| `filePath` | `string` | Convention: `` `${context.contractName}.sol` ``. |
| `lineStart` | `number` | 1-based line number where the issue starts. |
| `lineEnd` | `number` | 1-based line number where the issue ends. Can equal `lineStart`. |
| `codeSnippet` | `string` | The relevant code. Truncate to ~200 chars for readability. |
| `recommendation` | `string` | Actionable fix instructions. Be concrete. |
| `confidence` | `number` | How sure the plugin is. 0.9+ = high confidence, 0.5-0.7 = heuristic. |
| `references` | `string[]` | Links to SWC registry, CWE, blog posts, or docs. |

---

## Step-by-Step Guide

Follow these steps to create a new plugin from scratch.

### Step 1: Choose Your Plugin ID

Pick a kebab-case identifier. It should be unique and descriptive:

- `reentrancy`
- `access-control`
- `timestamp-dependence`

This will be used for: the directory name, the `metadata.id` field, and the npm package name.

### Step 2: Create the Directory Structure

```bash
mkdir -p plugins/my-plugin/src
```

### Step 3: Create package.json

Copy the template from [Plugin Structure](#plugin-structure) and update:

- `name` → `@veridion/plugin-<your-id>`
- `description` → What your plugin detects

### Step 4: Create Configuration Files

Copy `tsconfig.json`, `vitest.config.ts`, and `.eslintrc.js` from an existing plugin (e.g., `plugins/reentrancy/`).

### Step 5: Implement the Plugin

Create `src/index.ts` with your plugin class:

```ts
import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'my-plugin',
  name: 'My Vulnerability Detector',
  version: '1.0.0',
  description: 'Detects my specific vulnerability pattern.',
  severity: FindingSeverity.HIGH,
  category: 'CUSTOM',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['my-tag', 'vulnerability'],
  author: 'Your Name',
  references: ['https://swcregistry.io/docs/SWC-XXX'],
};

export class MyPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // No initialization needed
  }

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    // Your detection logic here
    // Use regex, AST parsing, or string matching on context.sourceCode

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return `Fix for ${finding.title}:\n${finding.recommendation}`;
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}
```

### Step 6: Add Your Detection Logic

When writing detection logic, consider these approaches:

#### A. Regex-Based Detection (Most Common)

Most existing plugins use regex to find patterns in `context.sourceCode`. This works well for well-defined patterns:

```ts
async analyze(context: AnalysisContext): Promise<FindingResult[]> {
  const findings: FindingResult[] = [];

  // Check for vulnerable pattern
  const pattern = /myVulnerableFunction\s*\(/g;
  let match;
  while ((match = pattern.exec(context.sourceCode)) !== null) {
    const lineNumber = context.sourceCode.slice(0, match.index).split('\n').length;

    findings.push({
      pluginId: this.metadata.id,
      title: 'Vulnerable Function Detected',
      description: 'myVulnerableFunction() is vulnerable to ...',
      severity: this.metadata.severity,
      filePath: `${context.contractName}.sol`,
      lineStart: lineNumber,
      lineEnd: lineNumber,
      codeSnippet: context.sourceCode.slice(match.index, match.index + 100),
      recommendation: 'Replace with ...',
      confidence: 0.85,
      references: this.metadata.references ?? [],
    });
  }

  return findings;
}
```

#### B. Multi-Pattern Detection

Check for combinations of patterns to reduce false positives:

```ts
// Pattern 1: Check for the vulnerability
const hasVulnerableCall = /\.dangerousCall\s*\(/.test(context.sourceCode);

// Pattern 2: Check for mitigations (guard clauses)
const hasMitigation = /safeGuard|nonReentrant/.test(context.sourceCode);

if (hasVulnerableCall && !hasMitigation) {
  findings.push({
    // ... only report when vulnerable AND no mitigation
  });
}
```

#### C. Line-by-Line Analysis

For context-dependent vulnerabilities, iterate over each line:

```ts
const lines = context.sourceCode.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;

  if (/vulnerablePattern/.test(line)) {
    // Check surrounding lines for context
    const hasContextClue = this.checkSurroundingLines(lines, i);

    findings.push({
      // ...
      lineStart: i + 1,
      lineEnd: i + 1,
      codeSnippet: line.trim(),
    });
  }
}
```

#### D. Solidity Version-Aware Detection

Different Solidity versions have different vulnerabilities:

```ts
const versionMatch = context.sourceCode.match(/pragma\s+solidity\s+[\^]?([0-9.]+)/);
if (versionMatch) {
  const version = parseFloat(versionMatch[1]!);
  if (version < 0.8) {
    // Pre-0.8.0 specific checks...
  }
}
```

### Step 7: Write Tests

Create `src/index.test.ts`. See the [Testing Your Plugin](#testing-your-plugin) section below.

### Step 8: Set Confidence Values

Assign a confidence score to each finding:

| Confidence | Meaning |
|-----------|---------|
| `0.95-1.0` | Definite vulnerability, nearly zero false positives |
| `0.80-0.94` | High likelihood, clear pattern detected |
| `0.60-0.79` | Heuristic-based, some false positives possible |
| `0.40-0.59` | Low confidence, pattern may be coincidental |
| `0.00-0.39` | Very speculative, consider not reporting |

---

## Testing Your Plugin

### Test Structure

Use Vitest with the following structure:

```ts
import { describe, expect, it } from 'vitest';
import { MyPlugin } from './index';

describe('MyPlugin', () => {
  const plugin = new MyPlugin();

  // 1. Metadata tests
  describe('metadata', () => {
    it('should have correct id', () => {
      expect(plugin.metadata.id).toBe('my-plugin');
    });

    it('should have correct severity', () => {
      expect(plugin.metadata.severity).toBe('HIGH');
    });

    it('should have correct category', () => {
      expect(plugin.metadata.category).toBe('CUSTOM');
    });
  });

  // 2. Context support tests
  describe('supportsContext', () => {
    it('should support solidity on ethereum', () => {
      expect(
        plugin.supportsContext({
          contractName: 'Test',
          sourceCode: '',
          chain: 'ethereum',
          language: 'solidity',
          compilerVersion: null,
          metadata: {},
        }),
      ).toBe(true);
    });

    it('should not support unsupported chains', () => {
      expect(
        plugin.supportsContext({
          contractName: 'Test',
          sourceCode: '',
          chain: 'unsupported-chain',
          language: 'solidity',
          compilerVersion: null,
          metadata: {},
        }),
      ).toBe(false);
    });
  });

  // 3. Positive detection tests
  describe('detection', () => {
    it('should detect vulnerable code', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    function badFunction() public {
        // vulnerable code here
    }
}`;

      const findings = await plugin.analyze({
        contractName: 'Vulnerable',
        sourceCode: code,
        chain: 'ethereum',
        language: 'solidity',
        compilerVersion: '0.8.19',
        metadata: {},
      });

      expect(findings.length).toBeGreaterThan(0);
    });
  });

  // 4. False positive (safe code) tests
  describe('safe code', () => {
    it('should not flag safe code', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function safeFunction() public {
        // safe code here
    }
}`;

      const findings = await plugin.analyze({
        contractName: 'Safe',
        sourceCode: code,
        chain: 'ethereum',
        language: 'solidity',
        compilerVersion: '0.8.19',
        metadata: {},
      });

      expect(findings.length).toBe(0);
    });
  });

  // 5. Finding structure tests
  describe('finding structure', () => {
    it('should have correct pluginId in findings', async () => {
      const findings = await plugin.analyze({ /* ... */ });
      for (const finding of findings) {
        expect(finding.pluginId).toBe(plugin.metadata.id);
      }
    });
  });
});
```

### Test Command

Run tests for your plugin only:

```bash
pnpm test --filter=@veridion/plugin-my-plugin
```

Run with coverage:

```bash
pnpm test --filter=@veridion/plugin-my-plugin -- --coverage
```

### Aim for 80%+ Coverage

Your tests should cover:
- **Metadata validation**: Verify all metadata fields are correct
- **Context matching**: Verify `supportsContext()` correctly filters chains and languages
- **Positive cases**: At least 2-3 examples of vulnerable code that your plugin should detect
- **Negative cases**: At least 2 examples of safe code that your plugin should NOT flag
- **Edge cases**: Empty contracts, unusual formatting, missing pragma statements

---

## Registering Your Plugin

After creating your plugin, register it so the scanner can use it.

### In the API

Plugins are registered in the API application by importing and adding them to the `PluginRegistry`:

```ts
import { PluginRegistry } from '@veridion/scanner-core';
import { ReentrancyPlugin } from '@veridion/plugin-reentrancy';
import { AccessControlPlugin } from '@veridion/plugin-access-control';
import { MyPlugin } from '@veridion/plugin-my-plugin';

const registry = new PluginRegistry();

registry.registerAll([
  new ReentrancyPlugin(),
  new AccessControlPlugin(),
  new MyPlugin(),
]);
```

> **Note:** The exact registration file depends on the API module configuration. Check `apps/api/src/modules/audits/` for the current registration pattern.

### Verify Registration

You can verify your plugin is registered by checking:

```ts
console.log(registry.getAllMetadata());
// Should include your plugin's metadata

console.log(registry.get('my-plugin'));
// Should return your plugin instance
```

---

## Best Practices

### 1. Minimize False Positives

The most important quality metric for a security plugin is its false positive rate. When in doubt, use these strategies:

- **Check for mitigations**: Before reporting, look for guard clauses or known safe patterns
- **Use confidence scores**: Mark heuristic detections with lower confidence (0.5-0.7)
- **Multi-pattern verification**: Require multiple signals before flagging

### 2. Be Specific in Descriptions

A good finding description answers: **What** is the vulnerability, **Why** it's dangerous, and **How** it could be exploited.

Bad:
> "Unchecked external call detected."

Good:
> "External call made to `msg.sender` before updating the `balances` mapping. This allows the called contract to re-enter `withdraw()` and drain funds due to the stale balance reading. Follow the Checks-Effects-Interactions pattern by updating state before making external calls."

### 3. Provide Actionable Recommendations

Don't just say what's wrong — show how to fix it:

```ts
recommendation:
  '1. Move `balances[msg.sender] = amount` before the external call\n' +
  '2. Use OpenZeppelin ReentrancyGuard: import "@openzeppelin/contracts/security/ReentrancyGuard.sol"\n' +
  '3. Add `nonReentrant` modifier to the function';
```

### 4. Use `references` for Credibility

Link to authoritative sources like:

- [SWC Registry](https://swcregistry.io/) — Smart Contract Weakness Classification
- [Consensys Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [CWE](https://cwe.mitre.org/) — Common Weakness Enumeration
- [OpenZeppelin Docs](https://docs.openzeppelin.com/)

### 5. Keep Dependencies Minimal

Your plugin should only depend on:
- `@veridion/scanner-types` — interfaces
- `@veridion/shared` — enums like `FindingSeverity`
- `@veridion/logger` — optional, for logging

Do **not** depend on scanner-core, database, or any backend-specific packages.

### 6. Follow the Naming Convention

| Convention | Example |
|-----------|---------|
| Plugin ID | kebab-case: `access-control` |
| Directory | matches ID: `plugins/access-control/` |
| Class name | PascalCase + `Plugin` suffix: `AccessControlPlugin` |
| Package name | `@veridion/plugin-{id}` |
| File name | `index.ts` (plugin), `index.test.ts` (tests) |

### 7. Handle Edge Cases

- **Empty contracts**: Return empty array `[]`
- **Missing pragma**: Don't throw, just skip version-dependent checks
- **Unusual formatting**: Regex should be robust to variations in whitespace
- **Large contracts**: Avoid catastrophic backtracking in regex

### 8. Keep `metadata` Static

Metadata should be a `const` outside the class, not computed dynamically:

```ts
// ✅ Good: static const
const metadata: PluginMetadata = { /* ... */ };

export class MyPlugin implements IRulePlugin {
  readonly metadata = metadata;
}

// ❌ Bad: computed in constructor
export class BadPlugin implements IRulePlugin {
  readonly metadata: PluginMetadata;
  constructor() {
    this.metadata = { id: generateId() }; // Avoid this
  }
}
```

---

## Reference Plugins

The following existing plugins serve as reference implementations:

| Plugin | Directory | Category | Key Techniques |
|--------|-----------|----------|----------------|
| **Reentrancy** | `plugins/reentrancy/` | REENTRANCY | Multi-pattern detection, mitigation checks, line iteration |
| **Access Control** | `plugins/access-control/` | ACCESS_CONTROL | Sensitive function enumeration, modifier detection |
| **Gas Optimizer** | `plugins/gas/` | GAS | Multiple independent patterns, performance best practices |
| **Overflow** | `plugins/overflow/` | ARITHMETIC | Version-aware detection, unchecked block analysis |
| **DOS** | `plugins/dos/` | DOS | Unbounded loop detection, external call validation |
| **Randomness** | `plugins/randomness/` | RANDOMNESS | Multi-source pattern matching, precise line tracking |
| **Oracle** | `plugins/oracle/` | ORACLE | AMM price detection, Chainlink safety checks |

Study these implementations to understand:
- How to structure detection logic
- How to write effective tests
- How to handle false positives
- How to use confidence scoring

---

## Next Steps

- [Plugin Example Walkthrough](./plugin-example.md) — Follow along building a real plugin
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Contribution guidelines
- [ARCHITECTURE.md](../ARCHITECTURE.md) — System architecture overview
- [API.md](../API.md) — API documentation
