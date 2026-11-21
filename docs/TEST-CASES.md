# ChargePilot test cases

## Automated policy tests

Run with `npm test`.

| ID | Scenario | Expected result |
| --- | --- | --- |
| ALLOC-01 | Request fits inside station headroom | Requested kW accepted |
| ALLOC-02 | Request exceeds remaining station capacity | Allocation is capped to available kW |
| ALLOC-03 | Remaining capacity is below minimum | Request is not allocated |
| ALLOC-04 | Negative capacity input | Policy rejects the input |

## Manual database workflow checks

These require MySQL and MongoDB running, `.env.local` and `.env.db.local` configured, schema initialized, and seed data loaded. They were not run as part of the source-only verification unless explicitly recorded in the task summary.

| ID | Scenario | Expected result |
| --- | --- | --- |
| AUTH-01 | Correct EV Owner credentials | Secure session cookie is set; owner dashboard loads |
| AUTH-02 | Wrong password | 401 response; generic error; no cookie |
| RBAC-01 | Owner posts station or telemetry change | 403 response |
| VEH-01 | Owner registers valid EV | EV is saved under the signed-in owner |
| VEH-02 | Duplicate registration plate | 409 response; no duplicate row |
| LOAD-01 | Request fits headroom and charger limit | Request, allocation and session commit; charger becomes busy |
| LOAD-02 | Request exceeds remaining station headroom | Request is waitlisted; no allocation/session created |
| LOAD-03 | Request power exceeds each available charger's maximum | Allocation is capped to the selected charger's limit |
| LOAD-04 | Two simultaneous requests compete for final headroom | Station row lock serializes them; combined active load never exceeds capacity |
| TX-01 | Force an allocation insert failure | Request insert rolls back; no partial allocation remains |
| SESSION-01 | Owner stops own session with final kWh | Procedure records cost; trigger releases charger and capacity |
| SESSION-02 | Owner attempts to stop another owner's session | 404 response; no state change |
| TELEMETRY-01 | Admin submits in-range reading | Document stored in MongoDB and newest reading appears in dashboard |
| TELEMETRY-02 | Telemetry has out-of-range SOC or power | 400 response; no document inserted |
| REPORT-01 | Owner downloads session CSV | Only that owner's sessions are included |

