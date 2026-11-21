# ChargePilot architecture notes

## Request and allocation flow

1. An EV Owner signs in; the API sets a signed, HTTP-only 12-hour cookie.
2. The owner submits a request for one of their registered vehicles and an active station.
3. A MySQL transaction locks that station row. The handler then sums all active sessions for the station, applies the capacity policy, locks an available charger, and caps the allocation at both station headroom and charger power.
4. The same transaction writes the request, allocation and active session and marks the charger in use. A waitlisted request is committed without taking a charger.
5. On completion, `sp_complete_session` calculates the cost with `fn_charging_cost`. A trigger releases the allocation and charger and updates request status.

The station row lock is the concurrency boundary: requests for one station cannot calculate capacity at the same time. If two requests arrive together, the second transaction waits and recalculates after the first commits. A failed statement rolls the full transaction back.

## Database responsibilities

**MySQL** holds identity, vehicles, stations, charger availability, requests, allocations, sessions, tariffs and billing. The schema is normalized and uses InnoDB foreign keys, `CHECK` constraints, unique constraints and purpose-built indexes.

**MongoDB** holds flexible charger readings (`chargerId`, `stationId`, power, voltage, current, battery state of charge and recorded timestamp). A compound charger/timestamp index supports recent-reading queries. The dashboard aggregation groups by charger and selects the latest reading.

## Advanced concepts

- Transaction with pessimistic station-row lock
- Stored function: `fn_charging_cost`
- Stored procedure: `sp_complete_session`
- Trigger: `trg_session_release_resources`
- Views: `vw_station_load`, `vw_session_billing`
- Indexes, uniqueness, foreign keys and check constraints
- MongoDB aggregation pipeline for latest telemetry per charger

## Auth and access rules

- Password hashes use bcrypt cost 12; passwords are never returned by the API.
- Session cookies are HTTP-only, SameSite=Lax and Secure in production.
- Admin-only operations create stations and ingest telemetry; owners can create requests and manage only their own vehicles and sessions.
- Database access is parameterized through the MySQL driver. The app connection should use the limited `chargepilot` account from the setup guide.

## Demo workflow

1. Initialize schema and create the app account.
2. Seed demo accounts, station, chargers, tariff and EV.
3. Sign in as `owner@chargepilot.local` and request power at the demo station.
4. Confirm the session appears in the dashboard and station utilization report.
5. Sign in as `admin@chargepilot.local`, post telemetry to `POST /api/telemetry`, and confirm the latest reading appears in the dashboard.
6. Complete the session with the measured kWh and confirm the billing view reflects tariff cost and capacity becomes available again.

This is an academic MVP, not an EVSE hardware controller. Telemetry comes from an authenticated simulator/operator API; the app does not implement OCPP or directly control charger electronics.
