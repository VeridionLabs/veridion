# Veridion

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blueviolet" alt="Version">
  <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License">
  <img src="https://img.shields.io/badge/status-active-success" alt="Status">
</p>

**AI-Powered Smart Contract Security Platform with On-Chain Audit Verification**

Veridion is an open-source platform that combines AI-assisted auditing, static analysis, and on-chain verification via Stellar Soroban to provide comprehensive smart contract security.

## Features

- 🔍 **Plugin-Based Scanner** - Modular security rules with zero-config extensibility
- 🤖 **AI-Powered Analysis** - Vulnerability explanation, fix suggestions, report generation via provider-agnostic AI layer
- 📊 **Audit Reports** - Generate reports in JSON, Markdown, HTML, or PDF
- ⛓️ **On-Chain Verification** - Immutable audit records on Stellar Soroban
- 🎨 **Modern UI** - Built with Next.js, shadcn/ui, and TailwindCSS
- 🔐 **Secure by Default** - RBAC, rate limiting, JWT auth, input validation
- 📦 **Monorepo** - Turborepo + pnpm workspaces for fast builds

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose
- PostgreSQL (or use Docker)

### Development

```bash
# Clone the repository
git clone https://github.com/veridion/veridion.git
cd veridion

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env

# Start infrastructure
docker compose up -d postgres redis

# Run database migrations
pnpm db:migrate

# Start all services
pnpm dev
```

The API runs on `http://localhost:4000` and the web app on `http://localhost:3000`.

### Docker

```bash
docker compose up -d
```

## Architecture

```
veridion/
├── apps/
│   ├── web/          # Next.js frontend (App Router)
│   ├── api/          # NestJS backend
│   └── docs/         # Documentation site
├── packages/
│   ├── shared/       # Types, enums, DTOs, utilities
│   ├── database/     # Prisma schema & client
│   ├── auth/         # JWT auth & RBAC
│   ├── scanner-core/ # Plugin-based scanner
│   ├── scanner-types/# Scanner type definitions
│   ├── ai-engine/    # AI provider abstraction
│   ├── parser/       # Smart contract parser
│   ├── report-generator/ # Report generation
│   ├── sdk/          # TypeScript SDK
│   ├── ui/           # shadcn/ui components
│   ├── logger/       # Structured logging
│   └── config/       # TSConfig & ESLint configs
├── plugins/          # Security detection plugins
├── contracts/        # Soroban smart contracts (Rust)
├── docker/           # Dockerfiles
└── .github/          # CI/CD, templates
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed diagrams and design decisions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TailwindCSS, shadcn/ui, TanStack Query |
| Backend | NestJS, Prisma, PostgreSQL, Redis, BullMQ |
| AI | Provider-agnostic (OpenAI, Anthropic) |
| Blockchain | Stellar Soroban (Rust) |
| Infrastructure | Docker, GitHub Actions, Turborepo |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Good First Issues

We maintain a list of [good first issues](https://github.com/veridion/veridion/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to help new contributors get started.

### Adding a New Security Plugin

Creating a new security rule requires zero changes to scanner-core:

1. Create `plugins/my-plugin/src/index.ts`
2. Implement the `IRulePlugin` interface from `@veridion/scanner-types`
3. Add your plugin to the registry in `apps/api`

See the [Plugins Guide](docs/plugins.md) for details.

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.

## Security

Please report security vulnerabilities to security@veridion.dev. See [SECURITY.md](SECURITY.md) for our disclosure policy.
