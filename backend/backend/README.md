# Backend setup

Copy `.env.example` to `.env` in this backend directory and fill in the values. Keep the MongoDB URI, JWT secret, and email credentials private; `.env` is ignored by Git.

`ADMIN_EMAIL` is required. Set it to the email address of the trusted first administrator before starting the backend. If that address already has an account, its next successful sign-in grants it administrator role; otherwise, register using that address. Other self-registered accounts are farm workers by default. Do not use a shared or publicly accessible email address for this setting.

The Users page reads and updates the same user accounts used by registration and login. Administrators can invite accounts, change roles, update profile details and farm assignments, and manage account status. Roles are enforced by backend middleware: administrators manage organization-wide data; farm managers can write records on assigned farms; livestock and crop officers can write records in their domains; accountants can write sales and expenses; and farm workers have read-only access to assigned farms. Deactivated accounts cannot sign in or use an existing session. At least one active administrator is always required, and the `ADMIN_EMAIL` account cannot be renamed, demoted, or deactivated from the Users page. Farm and record data is scoped by assigned farm rather than record owner.

Password reset email requires SMTP settings:

- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS` come from your email provider.
- Use port `465` for implicit TLS or port `587` with `EMAIL_SECURE=false` for STARTTLS.
- For Gmail, enable 2-Step Verification and use a Google App Password for `EMAIL_PASS`; your normal Gmail password will not work. Replace the example email and app-password values with real credentials.
- `EMAIL_FROM` must be an address/name your email provider allows you to send from.
- `FRONTEND_URL` must match the address used to open the frontend, such as `http://localhost:5173`.

Restart the backend after changing `.env`. The reset email contains a one-time link that expires after one hour. The API endpoints are `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`.

For local development, the Vite frontend proxies `/api` requests to `http://localhost:5000`. This also lets a phone using a Dev Tunnel reach the backend through the tunneled frontend; keep `VITE_API_URL=/api` (or leave it unset) in the frontend environment and restart Vite after changing it. For the deployed frontend, `.env.production` sets `VITE_API_URL` to the public backend URL including `/api`; update it if the backend hostname changes.

When deploying the backend as its own Vercel project, set the project's Root Directory to `backend/backend`. Vercel auto-detects the Express app from `index.js`, which exports the app from `server.js`; do not override the framework or build/output commands. Configure `MONGO_URI`, `JWT_SECRET` (at least 32 bytes), and `ADMIN_EMAIL` in the backend Vercel project's environment variables for Production, then redeploy it. The root health route can respond without a database connection; API requests return an explicit 503 response if required backend configuration or MongoDB connectivity is unavailable.

## Farm records and dashboard

All farm-data endpoints require the login JWT in an `Authorization: Bearer <token>` header. Administrators have organization-wide access; other users are scoped to their assigned farms and role.

- `GET /api/farms` lists the farms visible to the signed-in user with farm-specific totals. `POST` and `DELETE /api/farms` are administrator-only; farm managers can update assigned farms.
- Farm-data records are filtered by assigned farm IDs. Administrators can access all farms; farm managers can manage records on assigned farms; livestock officers can manage livestock/inventory; crop officers can manage crops; accountants can manage sales/expenses and view reports; farm workers have read-only access. Non-admin users cannot access unassigned-farm or unassigned records.
- `GET` and `POST /api/records/inventory` list or add inventory (`name`, `category`, `quantity`, `unit`, and optional `reorderLevel`).
- `GET /api/dashboard/summary` returns the livestock record count, active crop-field count and planted hectares, and current/previous calendar-month sales and expenses.
- `GET /api/dashboard/monitoring` returns six months of farm-scoped recorded sales and expenses, plus inventory, farm-status, inactive-crop, untagged-livestock, and due-routine alerts.
- `/api/routines` supports authenticated GET/POST and `/:id` PATCH/DELETE for farm routines. Routines are stored in MongoDB, shared with users assigned to the same farm, and due or overdue routines appear in dashboard alerts.
- Dashboard attention alerts include inventory at or below its reorder level (including zero-threshold, out-of-stock items), inactive or maintenance farms, inactive crop fields, livestock records without a tag ID, and uncompleted routines due within seven days. The count represents every alert row displayed. Farm-data alerts are limited to the signed-in user's assigned farms, except admins who can view all farms.
- `GET /api/users` lists accounts for administrators. `POST /api/users` sends a one-hour, single-use account activation invitation; configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, and `FRONTEND_URL`. New accounts stay pending until the invitee chooses a password.
- User roles are `admin`, `manager`, `livestock_officer`, `crop_officer`, `accountant`, and `staff`. Admins can assign phone numbers and farms and set accounts active, inactive, or suspended. Role, status and farm-scope changes revoke existing JWT sessions.
- `POST /api/users/:id/invitation` resends a pending account invitation; `POST /api/users/:id/revoke-sessions` invalidates the account's existing sessions.
- `PATCH`/`DELETE /api/users/me/profile-picture` lets a user manage their own picture. Admins can use `PATCH`/`DELETE /api/users/:id/profile-picture` for any account. Images are restricted to PNG/JPEG/WebP up to 2 MB and stored under `uploads/profile-pictures` beside `server.js`; MongoDB stores the served URL. Back up this directory with the database.
- `GET /api/users/activity` returns the administrator-only audit timeline for sign-ins, user access changes, farm changes, and record create/update/delete events.
- Vaccination, planting, and harvest reminders are stored as farm routines. Detailed animal health histories, crop harvest-date fields, and equipment service schedules are not currently separate backend records.
- `GET` and `POST /api/records/livestock` list or add livestock (`name`, `species`, optional `tagId`).
- `GET` and `POST /api/records/crops` list or add crop fields (`name`, `status` of `active` or `inactive`, `plantedHectares`).
- `GET` and `POST /api/records/sales` and `/api/records/expenses` list or add transactions (`description`, `amount`, `date`).
- `PUT /api/records/:type/:id` updates a record, and `DELETE /api/records/:type/:id` deletes one. Supported types are `livestock`, `crops`, `sales`, and `expenses`.

Sales and expenses are totaled by their record date in UTC calendar months. The dashboard refreshes every ten seconds and immediately after record changes in the same tab; other open tabs are notified as well.
