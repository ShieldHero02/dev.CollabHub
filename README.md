# CollabHub

CollabHub is a static local-first web app for quickly understanding who is free, busy, streaming, or ready to join a shared activity.

The project is intentionally not a corporate calendar, task manager, Trello clone, or CRM. The first screen must answer one question fast: who can be invited right now or for a nearby time slot?

## v2 direction

The `dev` branch is moving CollabHub toward a database-backed platform:

- `apps/api` - Node.js + TypeScript + Fastify API
- `apps/web` - React + TypeScript frontend
- `packages/domain` - pure business rules
- `packages/shared-types` - shared API types
- `prisma` - PostgreSQL schema and migrations
- `docs/v2-*.md` - architecture, data model, roadmap, and local setup

The legacy static app remains in the repository while v2 is being built. JSON/localStorage are not live storage for v2; legacy JSON is only an import source.

## What is included

- week availability heatmap
- month calendar with event previews
- participant schedules with comments per cell
- events as a separate layer over availability
- roles: master, admin, team lead, participant
- teams and team leads
- generated passwords
- JSON export and import
- stable local persistence through `localStorage` and an IndexedDB mirror
- static deployment config for GitHub Pages, Netlify, and Vercel

## Run locally

Open `login.html` or `index.html` in a browser.

On the first launch there are no users. The login page creates the first master account.

## Deploy legacy static site to GitHub Pages

1. Create a new repository on GitHub.
2. Upload all project files to the repository root.
3. Push to the `main` branch.
4. Open repository settings.
5. Go to **Pages**.
6. Select **Deploy from a branch**.
7. Select the publishing branch and `/root`.

No build step is required.

## Run v2 locally

See [docs/v2-local-development.md](docs/v2-local-development.md).

## Deploy to Netlify or Vercel

The project can also be deployed as a static site:

- publish directory: `.`
- build command: empty
- entry point: `index.html`

Headers are configured in `netlify.toml` and `vercel.json`.

## Security note

The current version is a trusted-community prototype. Passwords are hashed in the browser, but authentication and roles are still enforced client-side.

Before real production use, move authentication, accounts, permissions, password reset, audit logs, and imports/exports to a backend.

## User data compatibility

User data is intentionally stored under a stable key, `collabhub.userData`, instead of a release-specific project key. Older data from `collabhub.expandable.v3` is migrated automatically.

The app also mirrors the same state into browser IndexedDB database `collabhub-user-data`. This keeps user data separate from project files and makes future UI/code changes safer. Future schema changes should be added as migrations in `assets/app-data.js` without changing the stable storage key.

The dev deployment can bootstrap initial data from `data/dev-seed.json` on `dev.collabhub.rogaxiom.com`. This seed is used only when the browser has no existing CollabHub local data yet; it will not overwrite a user's current local database.
