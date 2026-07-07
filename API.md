# Veridion API

Base URL: `http://localhost:4000/api/v1`

## Authentication

### Register
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123",
  "displayName": "John Doe"
}
```

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

Response includes `accessToken` (15min) and `refreshToken` (7d).

Authenticated requests require: `Authorization: Bearer <accessToken>`

## Projects

### Create Project
```http
POST /api/v1/projects
Authorization: Bearer <token>

{
  "name": "My DeFi Protocol",
  "chain": "ethereum",
  "language": "solidity",
  "description": "A decentralized exchange",
  "repoUrl": "https://github.com/user/repo"
}
```

### List Projects
```http
GET /api/v1/projects?page=1&limit=20&search=defi
```

### Get Project
```http
GET /api/v1/projects/:id
```

## Audits

### Create Audit
```http
POST /api/v1/audits
{
  "projectId": "uuid",
  "commitHash": "abc123"
}
```

### List Audits
```http
GET /api/v1/audits?projectId=uuid&status=COMPLETED
```

### Get Audit with Findings
```http
GET /api/v1/audits/:id
```

## Reports

### Generate Report
```http
POST /api/v1/reports/generate
{
  "auditId": "uuid",
  "format": "MARKDOWN",
  "includeAiSummary": true
}
```

## Blockchain

### Verify on Stellar
```http
POST /api/v1/blockchain/verify
{
  "auditId": "uuid",
  "walletAddress": "G...XYZ"
}
```

### Check Verification Status
```http
GET /api/v1/blockchain/audit/:auditId
```

## AI Chat

```http
POST /api/v1/ai/chat
{
  "auditId": "uuid",
  "message": "Explain the reentrancy finding"
}
```

## Users

### Get Profile
```http
GET /api/v1/users/me
```

### Update Profile
```http
PUT /api/v1/users/me
{
  "displayName": "New Name",
  "walletAddress": "G...XYZ"
}
```

## Health

```http
GET /api/v1/health
```

---

Full Swagger documentation available at `http://localhost:4000/api/docs`.
