# Unchecked return values

Detects unchecked Solidity `.call()`, `.send()` and `.delegatecall()` results. Native `address.transfer()` reverts on failure and does not return a boolean, so it is excluded. ERC-20 `transfer()` and `staticcall()` are outside issue #16's acceptance scope.

```ts
import { createDefaultRegistry, Scanner } from '@veridion/scanner-core';

const scanner = new Scanner(createDefaultRegistry());
const result = await scanner.scan({
  contractName: 'Example',
  sourceCode: 'contract Example { function f(address payable a) external { a.send(1); } }',
  chain: 'ethereum',
  language: 'solidity',
  compilerVersion: '0.8.30',
  metadata: {},
});
```

`createDefaultRegistry()` includes this rule. `new PluginRegistry()` remains empty for callers that supply their own rule list. This is a scanner-library entrypoint; it does not deploy or configure an API service.

The rule tokenizes source, separates function scopes and tracks captured booleans along branches. Supported checks include `require(success)`, `assert(success)`, literal comparisons, boolean aliases, and explicit return/revert/break/continue paths handling a failed result. A result overwritten before its check remains a finding. Comments and strings cannot manufacture a check. Current and legacy call-option syntax, executable function-header arguments, and source initializers are included.

## Limits

This is a source-level heuristic, not a Solidity compiler or proof of contract safety:

- Receiver types are unavailable. An unrelated user-defined method with the same name can be reported.
- Arbitrary helper/modifier implementations and inline assembly are not summarized. Unknown calls invalidate possible storage bindings; they do not certify success.
- Custom recovery that continues normally is not recognized as a failure-handling exit. Returned booleans are not assumed to be checked by another function.
- Loops use a bounded worklist and widen changing bindings. Calls that can enter another iteration unchecked are reported, even if a later iteration might inspect the previous result.
- Analysis retains at most 64 branch states and examines at most 32 loop states. At a limit it reports conservatively rather than treating an unexplored call as safe. Complex expression side effects can also produce conservative findings.

## Validation

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm -r --filter @veridion/shared --filter @veridion/scanner-types --filter @veridion/logger build
pnpm --filter @veridion/plugin-unchecked-return test:coverage
pnpm --filter @veridion/plugin-unchecked-return build
pnpm --filter @veridion/scanner-core test
```

The coverage command enforces 80% for statements, branches, functions and lines. The fixture at `src/fixtures/acceptance.sol` contains eleven compiler-valid synthetic functions, with six expected findings. `review-regressions.sol` covers later loop iterations, executable headers, initializers and split guards. `guard-regressions.sol` distinguishes helper-mutated storage from primitive locals, named returns and short-circuit checks. These three synthetic fixture files compile with Solidity 0.8.30. No blockchain account or deployment is needed to run the rule.
