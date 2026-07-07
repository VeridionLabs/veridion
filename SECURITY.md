# Security Policy

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.

Instead, please email [security@veridion.dev](mailto:security@veridion.dev).

We will acknowledge your report within 48 hours and provide a timeline for resolution within 1 week.

## Supported Versions

| Version | Supported |
|---------|----------|
| 0.1.x   | ✅       |

## Security Practices

- All dependencies are scanned with Dependabot and updated weekly
- CodeQL analysis runs on every PR
- Secrets are managed via environment variables, never committed
- Authentication uses bcrypt for password hashing (12 rounds)
- JWT tokens have short-lived access tokens (15 min) and refresh token rotation
- Rate limiting is applied to all API endpoints
- Helmet and CORS are configured for all responses
- Input validation via class-validator and Zod
- Prisma parameterized queries prevent SQL injection

## Disclosure Policy

We follow responsible disclosure:
1. Reporter submits vulnerability
2. We validate and determine severity within 48 hours
3. We develop and test a fix
4. We release the fix and publish an advisory
