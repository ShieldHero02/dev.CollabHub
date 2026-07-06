# CollabHub v2 Local Development

## Requirements

- Node.js 22+
- pnpm via Corepack
- Docker with Docker Compose

## First Run

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The repository commits `pnpm-lock.yaml`, so Docker builds use strict lockfile mode.

API:

```text
http://localhost:4000/api/health
```

Web:

```text
http://localhost:5173
```

## Notes

The current repository still contains the legacy static site. The v2 application lives in:

- `apps/api`
- `apps/web`
- `packages/domain`
- `packages/shared-types`
- `prisma`

Do not use JSON files as live storage in v2. Legacy JSON is only an import source.
