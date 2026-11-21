# ChargePilot

Smart EV Charging Load Management System built with Next.js Route Handlers, MySQL and MongoDB.

## What is included

- Admin and EV Owner sign-in with bcrypt password hashing, signed HTTP-only sessions, and role checks.
- EV registration, station and charger creation, charging requests, live session completion, and request/session history.
- Capacity-aware power allocation. Each request locks its station row inside a MySQL transaction, then checks all active sessions before creating the allocation. Concurrent requests to one station are serialized to prevent station-wide over-allocation.
- MySQL normalized tables, foreign keys, checks, indexes, transaction workflow, function, stored procedure, trigger, and views.
- MongoDB charger telemetry storage and an aggregation that returns each charger's latest reading.
- Dashboard, station utilization, session billing fields, and a pure load-policy test suite.

## Requirements

- Node.js 20 LTS or newer with npm
- MySQL 8.0.29 or newer
- MongoDB Community Server 7.0 or newer
- Git (optional for local use)

The project intentionally uses only the agreed application stack. It does not need Redis, Docker, Kubernetes, or a separate API framework.

## 1. Install project dependencies

```powershell
npm install
Copy-Item .env.example .env.local
Copy-Item .env.db.example .env.db.local
```

Edit `.env.local` and `.env.db.local`. Generate `SESSION_SECRET` with a long random value (at least 32 characters). Choose a unique local MySQL app password. The MySQL admin and demo seed passwords live only in `.env.db.local`; the running app never loads them.

## 2. Start the databases

MySQL and MongoDB should run as local Windows services. Confirm them in Services (`services.msc`) or with:

```powershell
Get-Service *mysql*,*mongo*
```

If `mysql.exe` is not on PATH, add the installed MySQL `bin` directory to PATH, or use its full path. MongoDB data remains in its existing service data directory; this project does not reset it.

## 3. Initialize MySQL and the app account

Create the database objects using an administrator account:

```powershell
npm run db:init
```

Then create the restricted application account in MySQL Workbench or the MySQL shell. Replace the password with the same value as `MYSQL_PASSWORD` in `.env.local`:

```sql
CREATE USER IF NOT EXISTS 'chargepilot'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-unique-password';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON chargepilot.* TO 'chargepilot'@'127.0.0.1';
FLUSH PRIVILEGES;
```

The account host matches `MYSQL_HOST=127.0.0.1`; change it if you change that setting.

## 4. Seed demo data

Choose two passwords of at least 12 characters. They are hashed before being saved. The script creates a demo administrator, an EV owner, one station, three chargers, one tariff, and one EV. Re-running the script updates those demo users and reuses the demo station/charger records.

```powershell
npm run db:seed
```

The demo email addresses are `admin@chargepilot.local` and `owner@chargepilot.local`; use the passwords you selected. Do not reuse personal passwords.

## 5. Start and verify

```powershell
npm run dev
```

Open <http://localhost:3000>. Run project checks with:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

MongoDB creates the `chargepilot.telemetry` collection and indexes on first connection. MySQL remains the source of truth for accounts, vehicles, stations, requests, allocations, sessions, and billing.

## Database concepts to demonstrate

| Concept | ChargePilot implementation |
| --- | --- |
| Transaction and row locking | Request handler locks the station row and commits request/allocation/session together |
| Stored procedure | `sp_complete_session` |
| Function | `fn_charging_cost` |
| Trigger | `trg_session_release_resources` releases allocation and charger on completion |
| Views | `vw_station_load`, `vw_session_billing` |
| Indexes and constraints | Foreign keys, checks, unique keys and query indexes in `database/schema.sql` |
| MongoDB aggregation | Latest telemetry reading per charger in `/api/dashboard` |

## API overview

| Route | Purpose |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Session authentication |
| `GET/POST /api/vehicles` | EV Owner vehicle registration |
| `GET/POST /api/stations` | Station listing and Admin station/charger creation |
| `GET /api/chargers` | Admin charger list for telemetry demonstration |
| `GET/POST /api/charging/requests` | Requests and capacity-aware allocation |
| `GET /api/sessions`, `POST /api/sessions/:id/stop` | Session history and completion |
| `GET /api/reports`, `GET /api/reports/export` | Energy/cost summaries, utilization and owner-scoped CSV |
| `GET/POST /api/telemetry` | Telemetry history and Admin ingestion |
| `GET /api/dashboard` | MySQL summary and MongoDB latest-reading aggregation |

## Scope and limitations

- Telemetry ingestion is an authenticated API intended for charger simulators or an operator. Hardware/OCPP connectivity is outside this MVP.
- Allocation is immediate and all-or-waitlist. Priority is stored for a future scheduling policy; requests are not currently reordered automatically.
- Session energy is entered when a session is completed. Hardware readings do not yet automatically finalize billing.
- Station setup and telemetry endpoints are Admin-only. No public account registration or password recovery is included.


## Tests

`npm test` covers available-capacity allocation, station-capacity caps, insufficient remaining capacity, and invalid inputs. Database concurrency and end-to-end workflows need both local database services running and are not covered by this pure policy test suite.

For the complete local setup sequence and a 7–10 minute demonstration plan, see [`docs/PRESENTATION-GUIDE.md`](docs/PRESENTATION-GUIDE.md). Current verification limits are recorded in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
