# CollabHub v2 Data Model Draft

This is the first database draft. Names can still change before implementation.

## Main Tables

### users

Authentication identity.

- `id`
- `login`
- `email`
- `password_hash`
- `role`
- `status`
- `created_at`
- `updated_at`

### participant_profiles

Public participant profile connected to a user.

- `id`
- `user_id`
- `display_name`
- `color`
- `avatar_url`
- `interests`
- `created_at`
- `updated_at`

### user_preferences

Personal cabinet settings.

- `user_id`
- `theme`
- `density`
- `timezone`
- `week_starts_on`
- `default_view`
- `show_events`
- `created_at`
- `updated_at`

### teams

- `id`
- `name`
- `color`
- `lead_profile_id`
- `created_at`
- `updated_at`

### team_members

- `team_id`
- `profile_id`
- `created_at`

### availability_slots

One participant status for one exact date/hour.

- `id`
- `profile_id`
- `date`
- `hour`
- `status`
- `created_at`
- `updated_at`

Unique key:

```text
profile_id + date + hour
```

### availability_comments

Comment attached to one cell.

- `id`
- `profile_id`
- `date`
- `hour`
- `body`
- `created_at`
- `updated_at`

Unique key:

```text
profile_id + date + hour
```

### availability_presets

Personal fill presets.

- `id`
- `profile_id`
- `name`
- `start_hour`
- `end_hour`
- `status`
- `created_at`
- `updated_at`

### events

Event overlay.

- `id`
- `title`
- `activity`
- `description`
- `date`
- `start_hour`
- `end_hour`
- `created_by_user_id`
- `team_id`
- `visibility`
- `created_at`
- `updated_at`

Events can overlap. The UI decides how to stack them.

### event_participants

Status of every participant in an event.

- `event_id`
- `profile_id`
- `status`
- `updated_at`

Statuses:

- `going`
- `maybe`
- `no`
- `invited`

### connected_accounts

Future external login providers.

- `id`
- `user_id`
- `provider`
- `provider_account_id`
- `display_name`
- `created_at`
- `updated_at`

Providers later:

- `google`
- `twitch`

### import_jobs

Legacy JSON import tracking.

- `id`
- `created_by_user_id`
- `status`
- `source_format`
- `summary`
- `error`
- `created_at`
- `finished_at`

### audit_logs

Important mutations.

- `id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

## Permission Rules

### View

- authenticated users can view participant profiles and availability;
- future public pages can expose only selected public data.

### Edit Availability

- member: own profile only;
- teamlead: own profile, plus future team-specific actions;
- admin/master: all profiles.

### Edit Events

- member: own event participation status only;
- teamlead: events in their team;
- admin/master: all events.

### Manage Users

- master: all;
- admin: non-master accounts, depending on final policy;
- teamlead/member: no user management.

## Legacy JSON Import Mapping

Legacy data must be migrated once into normalized tables:

- `accounts` -> `users`
- `participants` -> `participant_profiles`
- `schedules` and `dateSchedules` -> `availability_slots`
- `comments` -> `availability_comments`
- `events` -> `events` + `event_participants`
- `memberPresets` -> `availability_presets`
- `teams` -> `teams` + `team_members`

After import, JSON is no longer used as storage.

