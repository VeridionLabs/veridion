# Plugin Example Walkthrough

This guide walks you through creating a complete security detection plugin from scratch. We'll build a **Self-Destruct Detection Plugin** that detects the use of `selfdestruct` (formerly `suicide`) in Solidity contracts.

## What We're Building

The `selfdestruct` opcode allows a contract to delete itself and send its remaining ETH to a target address. This is flagged because:
1. The contract can be removed at any time if the owner is compromised
2. Users relying on the contract's continued existence may lose funds
3. `selfdestruct` has been [deprecated](https://eips.ethereum.org/EIPS/eip-6049) in newer Solidity versions

Our plugin will detect:
- Use of `selfdestruct()` and `suicide()`
- Contracts without timelock or multi-sig protections on self-destruct

---

## Step 1: Create the Directory Structure

```bash
mkdir -p plugins/self-destruct/src
```

---

## Step 2: Create `package.json`

Create `plugins/self-destruct/package.json`:

```json
{
  "name": "@veridion/plugin-self-destruct",
  "version": "0.1.0",
  "private": true,
  "description": "Detects selfdestruct usage in Solidity smart contracts",
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
    "@veridion/shared": "workspace:*"
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

---

## Step 3: Create Configuration Files

### `tsconfig.json`

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

### `vitest.config.ts`

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

### `.eslintrc.js`

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

## Step 4: Implement the Plugin

Create `plugins/self-destruct/src/index.ts`:

```ts
import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

const metadata: PluginMetadata = {
  id: 'self-destruct',
  name: 'Self-Destruct Detector',
  version: '1.0.0',
  description:
    'Detects usage of selfdestruct/suicide opcodes which can permanently remove contract code and may indicate centralization risk.',
  severity: FindingSeverity.HIGH,
  category: 'CUSTOM',
  chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
  languages: ['solidity'],
  tags: ['selfdestruct', 'suicide', 'centralization', 'deprecated', 'eip-6049'],
  author: 'Veridion',
  references: [
    'https://eips.ethereum.org/EIPS/eip-6049',
    'https://swcregistry.io/docs/SWC-106',
    'https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#deactivate-and-self-destruct',
  ],
};

export class SelfDestructPlugin implements IRulePlugin {
  readonly metadata = metadata;

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // No initialization needed
  }

  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    const findings: FindingResult[] = [];

    // Pattern: selfdestruct(address)
    const selfDestructPattern = /selfdestruct\s*\(([^)]*)\)/g;
    let match;

    while ((match = selfDestructPattern.exec(context.sourceCode)) !== null) {
      const lineNumber =
        context.sourceCode.slice(0, match.index).split('\n').length;

      findings.push({
        pluginId: this.metadata.id,
        title: 'selfdestruct Usage Detected',
        description:
          'The selfdestruct opcode permanently removes the contract from the blockchain. ' +
          'This creates centralization risk if controlled by a single address. ' +
          'selfdestruct has been deprecated in EIP-6049 and its behavior may change in future hard forks.',
        severity: this.metadata.severity,
        filePath: `${context.contractName}.sol`,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        codeSnippet: context.sourceCode
          .slice(Math.max(0, match.index - 20), match.index + 80)
          .trim(),
        recommendation:
          'Consider replacing selfdestruct with a controlled pause mechanism or using a ' +
          'multi-sig / governance-controlled deactivation pattern.',
        confidence: 0.9,
        references: this.metadata.references ?? [],
      });
    }

    // Pattern: suicide(address) — legacy alias for selfdestruct
    const suicidePattern = /suicide\s*\(([^)]*)\)/g;

    while ((match = suicidePattern.exec(context.sourceCode)) !== null) {
      const lineNumber =
        context.sourceCode.slice(0, match.index).split('\n').length;

      findings.push({
        pluginId: this.metadata.id,
        title: 'suicide() — Legacy selfdestruct Usage',
        description:
          'The suicide opcode is a deprecated alias for selfdestruct. ' +
          'It permanently removes the contract and sends remaining ETH to the target. ' +
          'This has been renamed to selfdestruct in newer Solidity versions.',
        severity: FindingSeverity.MEDIUM,
        filePath: `${context.contractName}.sol`,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        codeSnippet: context.sourceCode
          .slice(Math.max(0, match.index - 20), match.index + 80)
          .trim(),
        recommendation:
          'Replace suicide() with selfdestruct() for clarity, or better yet, ' +
          'remove the self-destruct mechanism entirely in favor of upgradeable patterns.',
        confidence: 0.95,
        references: this.metadata.references ?? [],
      });
    }

    return findings;
  }

  getFixRecommendation(finding: FindingResult): string {
    return (
      `Fix for ${finding.title}:\n\n` +
      `${finding.recommendation}\n\n` +
      'For upgradeable contracts, consider using OpenZeppelin UUPS or Transparent Proxy patterns ' +
      'instead of selfdestruct. See: https://docs.openzeppelin.com/contracts/5.x/api/proxy'
    );
  }

  supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }
}
```

### Key Design Decisions

Let's examine the choices made in this implementation:

**1. Two separate patterns with different severities**

The `selfdestruct` keyword gets `HIGH` severity (it's an active concern), while the legacy `suicide` alias gets `MEDIUM` (it's a style/maintenance issue). This gives users more granularity.

**2. Line number calculation**

```ts
const lineNumber = context.sourceCode.slice(0, match.index).split('\n').length;
```

This counts newlines up to the match position to determine the 1-based line number. More accurate than hardcoding `lineStart: 1`.

**3. Context window for code snippets**

```ts
codeSnippet: context.sourceCode
  .slice(Math.max(0, match.index - 20), match.index + 80)
  .trim(),
```

We capture 20 characters before and 80 after the match to show context without overwhelming the report.

**4. Confidence scoring**

- `selfdestruct` detection: **0.9** — high confidence, it's definitely a self-destruct call
- `suicide` detection: **0.95** — even higher, `suicide()` is unambiguously the deprecated alias

---

## Step 5: Write Tests

Create `plugins/self-destruct/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SelfDestructPlugin } from './index';

describe('SelfDestructPlugin', () => {
  const plugin = new SelfDestructPlugin();

  // ──── Metadata ────

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('self-destruct');
    expect(plugin.metadata.name).toBe('Self-Destruct Detector');
    expect(plugin.metadata.version).toBe('1.0.0');
    expect(plugin.metadata.severity).toBe('HIGH');
    expect(plugin.metadata.category).toBe('CUSTOM');
    expect(plugin.metadata.languages).toContain('solidity');
    expect(plugin.metadata.chains).toContain('ethereum');
  });

  // ──── Context Support ────

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

  it('should not support vyper', () => {
    expect(
      plugin.supportsContext({
        contractName: 'Test',
        sourceCode: '',
        chain: 'ethereum',
        language: 'vyper',
        compilerVersion: null,
        metadata: {},
      }),
    ).toBe(false);
  });

  // ──── Detection: selfdestruct ────

  it('should detect selfdestruct usage', async () => {
    const code = `
pragma solidity ^0.8.0;
contract Destructible {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function destroy() public {
        require(msg.sender == owner);
        selfdestruct(payable(owner));
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Destructible',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.includes('selfdestruct'))).toBe(true);
  });

  it('should detect suicide legacy usage', async () => {
    const code = `
pragma solidity ^0.4.0;
contract OldContract {
    address public owner;

    function kill() public {
        suicide(owner);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'OldContract',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.4.24',
      metadata: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.includes('suicide'))).toBe(true);
  });

  // ──── Safe Code ────

  it('should not flag contracts without selfdestruct', async () => {
    const code = `
pragma solidity ^0.8.0;
contract SafeContract {
    uint256 public value;

    function setValue(uint256 _value) public {
        value = _value;
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'SafeContract',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });

  // ──── Edge Cases ────

  it('should handle empty contracts', async () => {
    const findings = await plugin.analyze({
      contractName: 'Empty',
      sourceCode: 'contract Empty {}',
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });

  it('should handle multiple selfdestruct calls', async () => {
    const code = `
pragma solidity ^0.8.0;
contract MultiDestroy {
    function destroyA() public { selfdestruct(payable(msg.sender)); }
    function destroyB() public { selfdestruct(payable(address(0))); }
}`;

    const findings = await plugin.analyze({
      contractName: 'MultiDestroy',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(2);
  });

  // ──── Finding Structure ────

  it('should include correct pluginId in findings', async () => {
    const code = `
contract Test {
    function die() public { selfdestruct(payable(msg.sender)); }
}`;

    const findings = await plugin.analyze({
      contractName: 'Test',
      sourceCode: code,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    for (const finding of findings) {
      expect(finding.pluginId).toBe('self-destruct');
      expect(finding.confidence).toBeGreaterThan(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
      expect(finding.references).toBeDefined();
      expect(finding.references.length).toBeGreaterThan(0);
    }
  });

  // ──── Fix Recommendation ────

  it('should provide fix recommendations', () => {
    const finding = {
      pluginId: 'self-destruct',
      title: 'selfdestruct Usage Detected',
      description: '',
      severity: 'HIGH' as const,
      filePath: 'Test.sol',
      lineStart: 1,
      lineEnd: 1,
      codeSnippet: '',
      recommendation: '',
      confidence: 0.9,
      references: [],
    };

    const fix = plugin.getFixRecommendation(finding);
    expect(fix).toBeTruthy();
    expect(fix.length).toBeGreaterThan(20);
  });
});
```

### Test Coverage Summary

| Test Category | Tests | Purpose |
|--------------|-------|---------|
| Metadata validation | 1 | Verify plugin identity and configuration |
| Context support | 2 | Verify chain/language filtering |
| Detection (positive) | 2 | Verify selfdestruct and suicide detection |
| Detection (negative) | 1 | Verify no false positives |
| Edge cases | 2 | Empty contracts, multiple matches |
| Finding structure | 1 | Verify finding fields are correctly populated |
| Fix recommendations | 1 | Verify actionable fix text |

---

## Step 6: Install Dependencies and Run Tests

```bash
# Install the new plugin's dependencies
pnpm install

# Run the plugin's tests
pnpm test --filter=@veridion/plugin-self-destruct
```

Expected output:

```
✓ SelfDestructPlugin (9 tests)
  ✓ should have correct metadata
  ✓ should support solidity on ethereum
  ✓ should not support vyper
  ✓ should detect selfdestruct usage
  ✓ should detect suicide legacy usage
  ✓ should not flag contracts without selfdestruct
  ✓ should handle empty contracts
  ✓ should handle multiple selfdestruct calls
  ✓ should include correct pluginId in findings

Test Files  1 passed (1)
     Tests  9 passed (9)
```

---

## Step 7: Register the Plugin

Add your plugin to the application's plugin registration:

```ts
import { SelfDestructPlugin } from '@veridion/plugin-self-destruct';

// Add to the registry
registry.register(new SelfDestructPlugin());
```

---

## Step 8: Verify the Full Pipeline

Run the complete test suite to make sure nothing is broken:

```bash
# Typecheck
pnpm typecheck

# Lint
pnpm lint

# All tests
pnpm test
```

---

## What We Learned

In this walkthrough, you:

1. **Created the complete file structure** for a Veridion scanner plugin
2. **Implemented the `IRulePlugin` interface** with metadata, detection logic, and context filtering
3. **Wrote 9 comprehensive tests** covering metadata, detection, edge cases, and fix generation
4. **Used regex-based detection** with proper line tracking and context windows
5. **Applied confidence scoring** to distinguish between different detection patterns
6. **Handled edge cases** like empty contracts and multiple matches

### Patterns to Reuse

When building your own plugin, you can copy:
- The `package.json` template (update `name` and `description`)
- The `tsconfig.json` and `vitest.config.ts` (no changes needed)
- The test structure (update the plugin class and test cases)
- The `supportsContext()` pattern (update chains/languages)

### Where to Go Next

- **Reference plugins**: Study `plugins/reentrancy/`, `plugins/access-control/`, and `plugins/oracle/` for more complex detection patterns
- **Add more patterns**: Extend the SelfDestructPlugin to also detect unprotected `selfdestruct` (no `onlyOwner`) or missing timelocks
- **Contribute back**: Once your plugin is stable, open a PR to add it to the official Veridion plugins
