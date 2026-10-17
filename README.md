# Agro Livestock System

Farm management application built with React/TypeScript/Vite and an Express API
using **SQLite**. It manages farms, livestock, crops, inventory, sales, expenses,
reports, routines, user invitations, profile pictures, and an audit timeline.
MongoDB, PostgreSQL, and a separate database server are no longer required.

## Deploy to Render for free

The repository's `render.yaml` creates **one free web service with no paid disk**.
It serves the frontend and `/api` together and stores SQLite and profile pictures
in temporary local storage. This configuration intentionally accepts data loss.

**Accounts, farm records, audit history, and uploaded pictures can disappear on
redeploys, restarts, and idle shutdowns.** Render spins free services down after
15 minutes without inbound traffic, and the next visit can take about a minute
to wake the app. The application recreates an empty database and the administrator
and demo records when it starts with fresh storage. This is suitable for a disposable demonstration.
See [Render's free service documentation](https://render.com/docs/free).

1. Commit the project and push it to your friend's GitHub repository. Do not commit
   `.env` files, SQLite databases, uploads, backups, or credentials.
2. In Render, choose **New → Blueprint**, connect the repository, and use the root
   `render.yaml`. Keep the repository root as the working directory.
3. Enter `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` with at least 12 characters
   (maximum 72 UTF-8 bytes). **Keep both settings in Render**: they recreate the
   administrator after temporary data is lost. Render generates `JWT_SECRET`.
4. Deploy. The Blueprint configures:

   | Setting | Value |
   | --- | --- |
   | Instance | Free |
   | Node version | 22 |
   | Build command | `npm run build:render` |
   | Start command | `npm start` |
   | Health check | `/healthz` |
   | `DATABASE_PATH` | `/tmp/agro-livestock/agro.sqlite` |
   | `UPLOAD_DIR` | `/tmp/agro-livestock/profile-pictures` |
   | `VITE_API_URL` | `/api` |
   | Persistent disk | None |

5. Open the service URL and sign in with the administrator credentials. Other users
   can sign up from the login page; an administrator can then assign their roles
   and farms from the Users page. Those accounts and assignments are temporary too.
6. For a custom domain, set `FRONTEND_URL` to its full HTTPS origin and redeploy.

Free Render services block outbound SMTP on ports 25, 465, and 587. The Blueprint
therefore does not ask for SMTP credentials. **Email invitations and password
recovery are unavailable in this free setup**; use public signup plus administrator
role/farm assignment for the demonstration. Existing SMTP support remains available
for local use or a host that allows it. Enabling email on the free service would
require integrating an email provider's HTTPS API.

Schema migrations and administrator setup run automatically before the server
starts. Public signup cannot claim the reserved administrator email. Existing
active admin passwords are not overwritten on ordinary starts; `ADMIN_PASSWORD`
is used when that account needs creating in a fresh database. After data loss,
previous sessions are invalid and users must sign in or register again.

## Seeded demonstration data

Startup creates the administrator using `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the
optional `ADMIN_NAME`. Administrator credentials are not hardcoded in source.
The Render Blueprint enables `SEED_DEMO_DATA=true`, which loads fictional records
into an empty farm database:

- 3 farms, 12 livestock records, 6 crop fields, and 8 inventory items.
- 18 sales and 18 expenses spread across the latest six UTC calendar months.
- 6 routines, including upcoming, overdue, and completed examples.
- An audit entry recording that demonstration data was loaded.

All sample records are named/described as demo data and belong to the administrator.
No additional user accounts or shared passwords are created. Edit the sample data
in `backend/backend/seeds/demo.js`. Dates are calculated when a fresh database is
seeded, keeping dashboard charts and task alerts useful.

Seeding is transactional and runs once per database. Restarting does not duplicate
records, undo edits, or restore individually deleted examples. Existing farm data
is preserved and skips the demo seed. After Render loses the entire database,
startup recreates the administrator and demonstration records automatically.
Set `SEED_DEMO_DATA=false` to create only the administrator and start with blank
farm data. For local/manual seeding after configuring the backend `.env`, use:

```sh
npm run db:seed
```

## Local development

Use Node 22.12+ (Render is configured for Node 22).

```sh
npm ci
npm ci --prefix backend/backend --ignore-scripts
cp backend/backend/.env.example backend/backend/.env
```

Set `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the backend `.env`.
No database server installation or connection URI is needed. The pinned SQLite
package includes its native binaries; backend installation skips lifecycle scripts
to avoid an unnecessary source compilation. Local storage defaults to
`backend/backend/data/agro.sqlite` and `backend/backend/uploads/profile-pictures`.
Optional `DATABASE_PATH` and `UPLOAD_DIR` overrides should use absolute paths.
Old `MONGO_URI` settings are unused and can be removed from local/hosting settings.

Run `npm run dev --prefix backend/backend` and `npm run dev` in separate terminals.
Vite proxies `/api` to localhost:5000. For the production layout locally, run
`npm run build` followed by `npm start`. Render sets `NODE_ENV=production` and
requires an explicit `DATABASE_PATH`; the Blueprint uses temporary storage.

## Optional local backups and restore

Create a consistent online SQLite backup with:

```sh
npm run db:backup -- /absolute/path/to/backups/agro-2026-10-15.sqlite
```

Use a new filename each time. This command checks the backup's integrity and
refuses to overwrite existing files or create a backup from a missing database.
It uses SQLite's online backup API so committed WAL data is included. Do not copy
only the live `.sqlite` file while the service is running. Back up the profile
pictures directory too. Free Render services have no shell access, so these
commands are intended for local use or a hosting environment with shell access.
A backup in temporary storage will disappear with the rest of that storage.
Schedule backups using your operations tooling and define a retention policy;
this app does not automatically schedule or prune backups.

To restore, stop the application so no process has the live database open, retain
a copy of the current database and its `-wal`/`-shm` sidecars, then replace the live
database with the verified backup. Remove the old sidecars from the live location
before restarting; restore matching profile pictures as needed. Test recovery on
a local copy first. Preserve `JWT_SECRET` if sessions should remain valid, or
rotate it to require everyone to sign in again.

## Existing MongoDB data

Existing MongoDB records are **not automatically transferred**. No remote database
has been modified. To migrate existing data, obtain JSON exports from the owner,
keep a backup, and test against a new local SQLite database first:

```sh
DATABASE_PATH=/absolute/path/to/new-agro.sqlite npm run db:import -- /path/to/exports
```

The offline importer accepts JSON arrays or newline-delimited JSON and MongoDB
Extended JSON IDs/dates. Expected files are `users.json`, `farms.json`,
`livestock.json`, `crops.json`, `inventory.json` (or `inventories.json`),
`sales.json`, `expenses.json`, `routines.json`, and `activities.json`.
Missing optional files are treated as empty; `users.json` is required. IDs,
password hashes, relationships, and timestamps are retained. Import requires an
empty target database and rolls back all imported rows if validation fails.
Resolve invalid/dangling legacy relationships before retrying. Imported data must
fit the current field lengths and validation rules. Copy existing profile pictures
into `UPLOAD_DIR`, preserving their filenames.

Verify the imported administrator's identity, role, and active status before
starting the application. Older versions permitted administrator signup without
email verification: inspect any existing admin accounts and rotate `JWT_SECRET`
if that version was publicly exposed. Never publish exports in the repository.

## Validation and handover

```sh
npm run lint
npm run build
npm test
npm audit --omit=dev
npm audit --prefix backend/backend --omit=dev
```

Build before testing so SPA route checks can use `dist`. Integration tests use
isolated temporary SQLite files and simulated email delivery; no external database,
MongoDB download, or real email credentials are required. CI runs these checks on
pushes and pull requests. Legacy GitHub Pages publishing is manual-only.

Before handover, verify in the actual Render account:

- `/healthz` returns 200, login works, and refreshing `/dashboard` loads the app.
- Register a worker through public signup, then assign a role and farm as admin.
- Assign farms and confirm each role's allowed records and routines.
- Create records and upload a profile picture, then confirm a fresh deployment
  can recreate the administrator even when previous data has disappeared.
- Check dashboard totals, financial reports, and CSV/print exports.
- Record who owns the Render account, GitHub repository, domain, and administrator
  credentials. Keep `ADMIN_PASSWORD` configured for automatic admin recreation.

No live Render deployment has been verified by the local test suite. SMTP delivery
is simulated in tests and is unavailable on the configured free service.
