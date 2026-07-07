# CollabHub v2 API Core

This is the first backend core contract. It is intentionally small.

## Auth

### `GET /api/auth/setup-status`

Returns whether the database needs the first Master account.

### `POST /api/auth/bootstrap`

Creates the first Master account only when there are no users.

Body:

```json
{
  "login": "master",
  "password": "secret-password",
  "displayName": "Master",
  "email": "optional@example.com"
}
```

Side effects:

- seeds system roles;
- seeds permissions;
- creates Master user;
- creates participant profile;
- creates preferences;
- creates server session.

### `POST /api/auth/login`

Logs in with login/password and creates a server session.

### `POST /api/auth/logout`

Deletes the current session.

### `GET /api/me`

Returns the current authenticated user and permissions.

## Users

### `GET /api/users`

Requires `user:manage`.

Returns users, profiles, and role assignments.

### `POST /api/users`

Requires `user:manage`.

Creates a user, participant profile, preferences, and role assignment.

## Participants

### `GET /api/participants`

Requires authentication.

Returns public participant profiles for the community.

## Roles

### `GET /api/roles`

Requires authentication.

Returns roles and permissions. This is read-only for now.

### `GET /api/permissions`

Requires Master-level role management.

Returns available permission keys.

## Session Model

The browser can use either:

- `Authorization: Bearer <token>`;
- or the httpOnly `collabhub_session` cookie set by the API.

Only session token hashes are stored in PostgreSQL.
