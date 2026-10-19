# Setup Guide

This guide gets the full Ignition Pay stack running locally in a few minutes. The
infrastructure (PostgreSQL + Redis) runs in lightweight Docker containers; the
apps (API, frontend, mobile) run natively on your machine for fast hot-reload.

## Prerequisites

- **Node.js** 20+ (frontend + API)
- **pnpm** 8+ (root + `packages/*`)
- **Flutter SDK** 3.22+ / **Dart SDK** 3.4+ (mobile)
- **Docker** 24+ with the Compose plugin (Desktop on macOS/Windows, Engine on Linux)
  - No local PostgreSQL or Redis install needed — Docker handles both.

> If you don't have Docker yet, see [Docker's install guide](https://docs.docker.com/engine/install/).

## 1. Bring up the infrastructure

From the repository root:

```bash
pnpm dev:infra          # docker compose up -d
pnpm dev:infra:status   # docker compose ps
pnpm dev:infra:logs     # docker compose logs -f
```

This starts:

| Service  | Image                | Host port | Container name           |
| -------- | -------------------- | --------- | ------------------------ |
| Postgres | `postgres:15-alpine` | `5432`    | `ignition-pay-postgres`  |
| Redis    | `redis:7-alpine`     | `6379`    | `ignition-pay-redis`     |

Both ports bind to `127.0.0.1` only (dev DBs are not exposed to the LAN),
persist data to named Docker volumes, and wait for healthy status before
dependent services can attach.

Convenience scripts (also runnable directly as `docker compose …`):

| Script                  | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| `pnpm dev:infra`        | Start Postgres + Redis in the background         |
| `pnpm dev:infra:stop`   | Stop containers (volumes + data preserved)       |
| `pnpm dev:infra:down`   | Stop + remove containers (volumes + data kept)   |
| `pnpm dev:infra:reset`  | Stop + remove containers **and** volumes (clean) |
| `pnpm dev:infra:logs`   | Tail all container logs                          |
| `pnpm dev:infra:status` | Show container status                            |

## 2. API (`ignition-api`)

```bash
cd ignition-api
npm install            # also runs `prisma generate` via postinstall
cp .env.example .env   # defaults already point at the compose stack
npx prisma migrate dev
npm run start:dev      # http://localhost:3001
```

The `ignition-api/.env.example` defaults match the compose stack:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stellaraid?schema=public`
- `REDIS_URL=redis://localhost:6379`
- `PORT=3001` (kept distinct from the Next.js frontend on port `3000`)

Useful API scripts:

```bash
npm run prisma:studio   # GUI for the dev database (http://localhost:5555)
npm run prisma:migrate  # Apply new migrations
```

## 3. Frontend (`ignition-pay-frontend`)

```bash
cd ignition-pay-frontend
npm install
npm run dev            # http://localhost:3000
```

Create `ignition-pay-frontend/.env.local` to point at the local API:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 4. Mobile (`ignition-mobile`)

```bash
cd ignition-mobile
flutter pub get
flutter run
```

For the Android emulator, `localhost` in the host machine maps to
`10.0.2.2` inside the emulator. Set:

```
# ignition-mobile/.env
API_BASE_URL=http://10.0.2.2:3001
```

iOS simulator + desktop platforms can use `http://localhost:3001` directly.

## 5. Shared TypeScript package (`packages/core-ts`)

```bash
pnpm install
pnpm --filter stellar-address-kit test
```

## Troubleshooting

**"port 5432/6379 is already allocated"** — another Postgres/Redis instance is
running on your host. Either stop the local service, or change the host
binding in `docker-compose.yml` (e.g. `"127.0.0.1:5433:5432"`) and update
`DATABASE_URL`/`REDIS_URL` in your `.env` files to match.

**"the database system is starting up"** — the Postgres container hasn't
finished initialising yet. `npm run prisma:migrate` will retry automatically.
You can also wait until `pnpm dev:infra:status` reports `healthy`.

**Want a clean slate?** `pnpm dev:infra:reset` removes named volumes — all
data, including the `stellaraid` database, is wiped.

**Need a DB UI?** Install [Adminer](https://www.adminer.org/) locally, or run
the standalone Docker image on demand:

```bash
docker run --rm -p 8080:8080 adminer
# open http://localhost:8080, system=PostgreSQL, server=host.docker.internal
```

## Production parity

The local compose stack mirrors the production Postgres + Redis configuration
(postgres:15, redis:7, AOF persistence enabled on Redis, named volumes for both).
TLS, replicas, and managed backups are intentionally out of scope for local dev.
