# Security

CollabHub is currently a static local-first prototype.

## Current model

- Data is stored in `localStorage`.
- The same state is mirrored into browser IndexedDB database `collabhub-user-data`.
- The stable user-data key is `collabhub.userData`; release-specific storage keys should not be used for active data.
- The dev deployment may include `data/dev-seed.json` as public bootstrap data. Do not put real secrets or raw passwords in that file.
- Passwords are hashed in the browser with Web Crypto before being saved.
- Roles and access checks run in client-side JavaScript.
- There is no backend session, server-side account store, or server-side permission layer.

## Before real production use

Move authentication, password reset, account management, schedule permissions, event permissions, audit logs, and imports/exports to a backend.

Do not treat the current client-side role system as protection against a motivated attacker. It is suitable for a trusted community prototype and UI testing.
