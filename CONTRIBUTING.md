# Contributing to Veridion

Welcome! We're excited to have you contribute.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/veridion.git`
3. Install dependencies: `pnpm install`
4. Set up Docker services: `docker compose up -d postgres redis`
5. Run migrations: `pnpm db:migrate`
6. Start dev: `pnpm dev`

## Development Workflow

### Branch Names

Use conventional branch names:
- `feat/description` for features
- `fix/description` for bug fixes
- `docs/description` for documentation
- `refactor/description` for refactoring

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scanner): add reentrancy detection plugin
fix(api): handle null findings in audit response
docs(readme): update quick start section
```

### Pull Requests

1. Create a PR against `main`
2. Fill out the PR template
3. Ensure CI passes (lint, typecheck, test, build)
4. Request review from a maintainer

## Code Style

- TypeScript strict mode everywhere
- No `any` types (enforced by ESLint)
- Use `const` assertions and branded types where appropriate
- Follow existing patterns in the codebase

## Testing

- Write tests for new features
- Aim for 80%+ coverage
- Frontend: Vitest + Playwright
- Backend: Jest
- Contracts: Soroban test framework

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm turbo test --filter=@veridion/scanner-core

# Run with coverage
pnpm test:coverage
```

## Adding a New Security Plugin

Plugins are the core of Veridion's extensible security scanning. Each plugin detects a specific vulnerability pattern and is completely independent of the scanner engine — no changes to `scanner-core` are required!

### Quick Start

1. Create a new directory: `plugins/my-vuln/`
2. Add `package.json`, `tsconfig.json`, `vitest.config.ts`, and `.eslintrc.js`
3. Implement the `IRulePlugin` interface from `@veridion/scanner-types`
4. Write comprehensive unit tests (aim for 80%+ coverage)
5. Register your plugin in the API's plugin registry
6. Run `pnpm test --filter=@veridion/plugin-my-vuln` to verify

### Documentation

- **[Plugin Development Guide](docs/plugins.md)** — Complete reference for `IRulePlugin`, `PluginMetadata`, `AnalysisContext`, `FindingResult`, best practices, and testing
- **[Plugin Example Walkthrough](docs/plugin-example.md)** — Step-by-step tutorial building a Self-Destruct Detection Plugin from scratch

### Requirements

- Plugin must implement the `IRulePlugin` interface
- Plugin must include unit tests covering positive cases, negative cases, and edge cases
- Plugin metadata must be complete (id, name, version, description, severity, category, chains, languages, tags)
- Confidence scores must be accurate (0.9+ for definite detections, 0.5-0.7 for heuristics)
- No dependencies on `scanner-core` or backend packages — only `@veridion/scanner-types`, `@veridion/shared`, and optionally `@veridion/logger`
- Follow the naming conventions: kebab-case ID, PascalCase class name with `Plugin` suffix

## Package Dependency Rules

- `@veridion/shared` - No backend/frontend-specific code
- `@veridion/scanner-types` - Only interfaces, no implementation
- `@veridion/database` - Only Prisma schema and client exports
- Plugins - Only depend on `@veridion/scanner-types`

## Getting Help

- [GitHub Discussions](https://github.com/veridion/veridion/discussions)
- [Discord Community](https://discord.gg/veridion)

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
