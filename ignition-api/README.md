# Ignition API

NestJS backend for the Ignition Pay ecosystem.

## Installation

```bash
npm install
```

## Running

```bash
# development
npm run start:dev

# production
npm run start:prod
```

## Environment

Copy `.env.example` to `.env` and fill in the values.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /payments | Initiate a payment |
| POST | /addresses/verify | Verify a Stellar address |
| GET | /transactions | List transactions |
| GET | /health | Health check |

## Architecture

- **NestJS** — framework
- **Prisma** — ORM
- **Redis** — queues and caching
- **JWT** — authentication
# Ignition Pay API

The NestJS backend API for the Ignition Pay Stellar wallet ecosystem.

## Stack

- **Framework**: NestJS 11
- **Language**: TypeScript 5.7
- **Database**: PostgreSQL via Prisma ORM
- **Caching**: Redis via Keyv / cache-manager
- **Queue**: Bull (Redis-backed job queues)
- **Blockchain**: Stellar SDK + Soroban RPC
- **Auth**: JWT + Stellar SEP-10 Web Authentication

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run start:dev
```

## API Modules

| Module | Description |
|--------|-------------|
| Auth | Stellar SEP-10 web auth, JWT sessions |
| Users | User registration and profile management |
| Wallets | Keypair generation, balance queries |
| Transactions | Build, sign, submit Stellar transactions |
| Addresses | Address validation and routing |
| Anchors | SEP-6/24/31 anchor integrations |
| Queue | Background job processing |
| Health | Service health checks |

## Rate Limiting

Every request falls into exactly one tier, based on its route prefix and credentials
(see `src/throttler/throttler-tiers.ts`):

| Tier | Applies to | Limit | Counter keyed by |
|------|------------|-------|------------------|
| `auth` | `/auth/*` | 10 req/min | client IP |
| `public` | unauthenticated requests | 60 req/min | client IP |
| `authenticated` | requests with `Authorization: Bearer …` or `x-api-key` | 120 req/min | user ID (from a valid JWT), else IP |

Routes can add a tighter limit on top of their tier with
`@Throttle({ strict: { limit, ttl } })` or `@Throttle({ default: { limit, ttl } })`.

When a limit is exceeded the API responds `429 Too Many Requests` with a
`Retry-After` header (seconds). Successful responses include `X-RateLimit-Limit`,
`X-RateLimit-Remaining` and `X-RateLimit-Reset`.

Limits can be overridden per environment with `THROTTLE_AUTH_LIMIT`,
`THROTTLE_PUBLIC_LIMIT`, `THROTTLE_AUTHENTICATED_LIMIT` (and matching `*_TTL` in ms).

## Environment

See `.env.example` for required environment variables.
