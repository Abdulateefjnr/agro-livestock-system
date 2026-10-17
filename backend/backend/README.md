# API

See the repository [README](../../README.md) for the supported Render deployment,
local setup, environment variables, backups, and release checks.

All farm APIs require a Bearer JWT. Accounts are checked against SQLite on every
request; inactive accounts and revoked sessions are rejected. Roles and farm
assignments are enforced by the server:

- Admin: all farms, records, routines, user management, and audit activity.
- Manager: records and routines on assigned farms; update assigned farms.
- Livestock officer: livestock/inventory writes and assigned-farm routines.
- Crop officer: crop writes and assigned-farm routines.
- Accountant: sales/expenses writes and assigned-farm reads; routines are read-only.
- Staff: assigned-farm reads; routines are read-only.

Public signup creates staff with no assigned farms. Only private startup bootstrap
or an existing administrator can grant admin access. Unassigned records are visible
only to admins; writers must select an assigned farm when creating records.
Personal routines without a farm are visible only to their creator and admins.
Routine repeat labels are stored metadata; there is no automatic recurring job or
outbound reminder scheduler. Dashboard alerts display upcoming and overdue tasks.

`GET /healthz` checks configuration, database connectivity, and initial admin setup.
Profile pictures are served at `/api/profile-pictures/:filename` and use the
`UPLOAD_DIR` filesystem directory. The free Render setup uses temporary storage and accepts loss of pictures and records.

SQLite schema and repositories live in `database/`. Database migrations run at startup.
See the root README for online backups, restore, and optional legacy JSON import.

On free Render, keep ADMIN_PASSWORD configured to recreate the administrator after
storage is lost. SMTP invitations/recovery are unavailable because Render blocks
SMTP ports; use public signup and administrator assignment for demonstrations.
