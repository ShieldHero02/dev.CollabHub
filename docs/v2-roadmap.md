# CollabHub v2 Roadmap

## Phase 0: Architecture Lock

Goal: agree on technical foundation before code.

- approve stack;
- approve repository shape;
- approve core modules;
- approve roles and permissions;
- approve database draft;
- approve UI/design-system direction.

## Phase 1: Project Scaffold

Goal: empty but runnable application.

- monorepo setup;
- API app;
- web app;
- shared TypeScript config;
- lint/format/test scripts;
- Docker local environment;
- PostgreSQL local container;
- Prisma setup;
- healthcheck endpoint.

## Phase 2: Auth and Accounts

Goal: real accounts and protected pages.

- login/logout;
- password hashing;
- sessions;
- roles;
- current user endpoint;
- master bootstrap;
- personal cabinet shell.

## Phase 3: Participants and Availability

Goal: replace localStorage schedule with database-backed availability.

- participant profiles;
- own schedule editing;
- read-only access to other schedules;
- comments per cell;
- presets;
- aggregate overview;
- week/month navigation.

## Phase 4: Events

Goal: event overlay with correct permissions.

- create/edit/delete events by role;
- own event status for members;
- event suggestions based on availability;
- overlapping event display;
- month view event display.

## Phase 5: Admin and Teams

Goal: usable community management.

- users;
- roles;
- teams;
- team leads;
- member assignment;
- audit log basics.

## Phase 6: Legacy Import

Goal: migrate current production JSON data into PostgreSQL.

- upload legacy JSON;
- validate;
- preview;
- import;
- import report;
- rollback strategy for failed imports.

## Phase 7: Design System and Responsive Polish

Goal: make the UI easy for a designer to replace and easy for users to understand.

- design tokens;
- theme system;
- component library;
- mobile views;
- tablet views;
- desktop heatmap;
- accessibility checks.

## Phase 8: Deployment

Goal: deployable anywhere.

- production Docker config;
- migrations on deploy;
- backup guide;
- environment guide;
- dev/staging/prod separation.

## Later

- Google login;
- Twitch login;
- public viewer pages;
- notifications;
- realtime updates;
- richer community modules.

