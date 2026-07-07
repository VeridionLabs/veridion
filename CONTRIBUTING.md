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

1. Create a new directory: `plugins/my-vuln/`
2. Add `package.json` with `@veridion/scanner-types` as dependency
3. Implement the `IRulePlugin` interface
4. Add unit tests
5. Register in `apps/api/src/plugins/registry.ts`

No changes to scanner-core required!

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
