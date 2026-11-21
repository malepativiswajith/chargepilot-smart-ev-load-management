# ChargePilot run and presentation guide

## First-time setup

Run these in PowerShell from the project folder. On this laptop, Node.js, Git, MySQL and MongoDB are already installed, and npm dependencies are already installed in the working copy. The ZIP intentionally omits `node_modules`, so install dependencies after unzipping.

```powershell
npm install
Copy-Item .env.example .env.local
Copy-Item .env.db.example .env.db.local
```

Edit the two local files in VS Code. Keep the files private and do not send their password values in chat.

- In `.env.local`, set `SESSION_SECRET` to a random value of at least 32 characters. Set `MYSQL_PASSWORD` to the password you will assign to the restricted `chargepilot` MySQL account.
- In `.env.db.local`, set `MYSQL_ROOT_PASSWORD` to your local MySQL administrator password. Set different 12+ character values for `SEED_ADMIN_PASSWORD` and `SEED_OWNER_PASSWORD`.
- If `mysql.exe` is not on PATH, set `MYSQL_CLI_PATH` to `C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe`.

Both database Windows services were started after approval. If they are stopped later, open `services.msc`, start the MySQL and MongoDB services, or use an elevated PowerShell window.

Initialize the project schema with the local administrator credentials:

```powershell
npm run db:init
```

In MySQL Workbench or the MySQL Shell, create the limited app account using the exact `MYSQL_PASSWORD` you chose:

```sql
CREATE USER IF NOT EXISTS 'chargepilot'@'127.0.0.1' IDENTIFIED BY 'same-password-as-MYSQL_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON chargepilot.* TO 'chargepilot'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Load demo accounts and records:

```powershell
npm run db:seed
```

Start the application:

```powershell
npm run dev
```

Open <http://localhost:3000>. Demo sign-ins are `admin@chargepilot.local` and `owner@chargepilot.local`, each with the separate password you chose in `.env.db.local`.

## 7–10 minute live demonstration

1. **Admin overview (1 minute):** Sign in as Admin. Show active stations, charger count, station capacity, available headroom and the MySQL/MongoDB data split.
2. **Owner vehicle and request (2 minutes):** Sign out, sign in as EV Owner, register a vehicle, then request a power amount at the demo station. Show the allocated kW and new active session.
3. **Capacity behavior (1 minute):** Submit another request that exceeds remaining station headroom. Show that it is waitlisted and does not create an active allocation. Explain that a station-row lock makes concurrent requests recalculate capacity in sequence.
4. **Return to Admin (1 minute):** Show the changed station utilization and active session. Add a simulated reading in the MongoDB telemetry form; point to the latest reading card.
5. **Complete and bill (1 minute):** Switch back to the EV Owner, enter the final delivered kWh and complete the session. Explain that the stored procedure calculates cost, the trigger releases the charger and the transaction preserves consistent status.
6. **Reports and database design (2–4 minutes):** Open Reports and export the CSV. In MySQL Workbench, show `vw_station_load`, `vw_session_billing`, `fn_charging_cost`, `sp_complete_session`, the release trigger and indexes. In MongoDB Compass or shell, show the `telemetry` collection and the latest-per-charger aggregation.

## Short architecture explanation

“MySQL owns the transactional records: users, vehicles, stations, chargers, requests, allocations, sessions and billing. MongoDB stores variable charger readings. A request locks its station row, sums station-wide active power, checks available charger power, and writes request, allocation and session in one transaction. The lock prevents two simultaneous requests from spending the same remaining capacity. On completion, the stored procedure records energy and cost, and the trigger releases the charger. The dashboard joins MySQL operational metrics with a MongoDB aggregation for each charger’s latest reading.”

## Likely questions

- **Why use both databases?** MySQL enforces relationships and transactions for ownership, allocation and billing. MongoDB is suitable for flexible, append-heavy sensor observations and aggregation.
- **What prevents over-allocation?** A `SELECT ... FOR UPDATE` lock on the station row serializes allocation decisions. Each transaction then reads current active allocations before it commits.
- **What happens when capacity is insufficient?** The request is retained as `WAITLISTED`; no charger or active session is reserved.
- **Which advanced DBMS concepts are present?** Transactions, row locks, stored function and procedure, trigger, views, indexes, foreign keys and checks, plus a MongoDB aggregation pipeline.
- **Is this connected to a physical charger?** No. Telemetry is simulated through an Admin-only endpoint and form. OCPP and direct hardware control are outside this academic MVP.

## Before presenting

- Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- Verify both services are running and sign in once as each role.
- Have a second browser profile ready so Admin and EV Owner views can be switched quickly.
- Use only local demo credentials, never personal passwords.
