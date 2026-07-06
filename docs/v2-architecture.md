# CollabHub v2 Architecture

## Product Direction

CollabHub v2 is a community coordination platform. The first product module is availability planning: help a small community understand in 30-60 seconds who is free, busy, streaming, or ready to join an activity.

The system must stay simple for users and extensible for future modules:

- availability and weekly planning;
- events and collaborations;
- teams and team leads;
- personal accounts and profiles;
- future public viewer pages;
- future Twitch, Google, and other login integrations.

CollabHub is not a calendar clone, not a task manager, and not a CRM. Every product feature must answer one question: does it help gather people faster?

## Recommended Stack

Use a custom application instead of WordPress.

WordPress is portable and convenient for content sites, but CollabHub needs strict domain logic: schedules, permissions, teams, event participation, future realtime sync, and integrations. A custom stack gives us clearer ownership of those rules.

Recommended v2 stack:

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript + Fastify
- Database: PostgreSQL
- ORM and migrations: Prisma
- Authentication: server sessions or JWT with refresh tokens
- Password hashing: Argon2id
- Deployment: Docker + docker-compose first, then any VPS/PaaS

The app should not depend on one hosting provider. It must run with environment variables, migrations, and a standard container setup.

## Repository Shape

Use a monorepo so frontend, backend, schema, and shared types evolve together.

```text
apps/
  api/
    src/
      main.ts
      modules/
      plugins/
      http/
    test/
  web/
    src/
      app/
      pages/
      modules/
      shared/
      design-system/
    test/
packages/
  domain/
    src/
      auth/
      availability/
      events/
      teams/
      users/
  config/
  shared-types/
prisma/
  schema.prisma
  migrations/
  seed.ts
docs/
docker-compose.yml
Dockerfile.api
Dockerfile.web
.env.example
```

## Architectural Layers

### Domain

Pure business rules. No HTTP, no database client, no UI.

Examples:

- `UserAccount`
- `ParticipantProfile`
- `AvailabilitySlot`
- `Event`
- `Team`
- `PermissionPolicy`
- `AvailabilityAggregator`

Rules live here:

- a member edits only their own availability;
- a member can view other participants;
- a member edits only their own event participation status;
- a master/admin manages users, roles, teams, imports;
- a team lead can manage team events;
- events are an overlay and never replace availability.

### Application

Use cases. Each use case is explicit and testable.

Examples:

- `UpdateAvailabilitySlot`
- `BulkFillAvailabilityRange`
- `CreateEvent`
- `UpdateOwnEventStatus`
- `ImportLegacyJson`
- `CreateParticipantAccount`
- `AssignUserRole`

### Infrastructure

Adapters for PostgreSQL, Prisma, password hashing, session storage, file import, external auth providers, and future integrations.

### API

Fastify routes, validation schemas, auth middleware, permission checks, and response DTOs.

### Web

The UI consumes API contracts. It does not own permissions. It may hide actions, but backend is the final authority.

## Core Modules

### Auth

Responsibilities:

- login and logout;
- session management;
- password changes;
- future OAuth providers;
- account recovery later.

Roles:

- `master`
- `admin`
- `teamlead`
- `member`
- `viewer`

### Users

Responsibilities:

- user accounts;
- participant profiles;
- personal cabinet;
- profile styling;
- color/avatar;
- interests;
- personal preferences.

### Availability

Responsibilities:

- availability slots by date and hour;
- comments per cell;
- personal presets;
- aggregate availability map;
- week/month navigation;
- future realtime updates.

Statuses:

- `free`
- `busy`
- `maybe`
- `stream`
- `work`
- `study`
- `unknown`

### Events

Responsibilities:

- event overlay;
- event participants;
- participant status in event;
- suggestions of free people;
- overlapping events.

Events do not change availability slots. They are displayed as a separate layer.

### Teams

Responsibilities:

- teams;
- team leads;
- team membership;
- future team-specific views.

### Import

Responsibilities:

- accept legacy JSON export;
- validate shape;
- show import preview;
- migrate all supported data to PostgreSQL;
- produce an import report;
- never use JSON as live storage.

### Design System

Responsibilities:

- design tokens;
- themes;
- shared components;
- layout primitives;
- responsive rules;
- accessible interaction states.

Design must be easy to replace by a designer without rewriting business logic.

## Database Principles

Do not store live service state in JSON.

Availability must be stored as normalized rows:

```text
participant_id + date + hour -> status
```

If a row does not exist, status is `unknown`.

This allows planning weeks, months, or half a year ahead without creating huge empty tables.

## API Principles

API should be boring and predictable:

- `/api/auth/*`
- `/api/me`
- `/api/participants`
- `/api/availability`
- `/api/events`
- `/api/teams`
- `/api/imports`
- `/api/admin/*`

All write endpoints must check permissions server-side.

## Personal Cabinet

Every user gets a personal cabinet:

- account settings;
- password management;
- profile color/avatar;
- interests;
- personal schedule presets;
- UI preferences;
- connected auth providers later;
- privacy controls later.

The cabinet should be simple enough for non-technical users.

## UI and UX Principles

The product must be friendly to a casual community user:

- no corporate dashboard feeling;
- no dense CRM-like workflows;
- primary screens answer "who can join?";
- mobile-first shortcuts for status and availability;
- desktop heatmap for detailed planning;
- clear empty states;
- no hidden destructive actions;
- no overwhelming text in cells;
- details open on click/tap.

Responsive modes:

- Phone: quick status, today, tonight, my schedule, event status.
- Tablet: compact weekly planning.
- Desktop: full heatmap and side detail panel.
- Wide desktop: richer overview without forcing giant cards.

## Deployment Principles

The finished app must move easily between servers.

Minimum deployment package:

- `.env.example`
- Dockerfile for API
- Dockerfile for web
- `docker-compose.yml`
- PostgreSQL container for local/dev
- Prisma migrations
- seed/import command
- healthcheck endpoint
- build scripts

Production can run on:

- VPS with Docker;
- Render/Railway/Fly-like platforms;
- any provider that supports Node.js and PostgreSQL;
- later split frontend CDN + backend API.

GitHub Pages alone is not enough for v2 because v2 needs a backend and database.

