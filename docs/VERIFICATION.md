# Verification record

## Verified in the local workspace

- Node.js 22.20.0 and npm 10.9.3 are available.
- MySQL Community Server CLI 8.4.9 and MongoDB Server 8.2.1 are installed; Windows Services reported both services running after the user approved starting them.
- The ChargePilot sign-in page rendered in the browser on the loopback preview. Its responsive sign-in screen was captured in the Codex conversation.
- `npm test`: 4 passed, 0 failed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; all 13 API routes plus the app page compiled.

## Not yet verified

- MySQL schema initialization and demo seeding. The user's MySQL administrator and seed credentials must be entered into the ignored `.env.db.local` file.
- Authenticated API workflows, MySQL transaction concurrency and stored routine behavior against the live service. The app account password must be entered in `.env.local` and the schema initialized first.
- MongoDB telemetry write/read/aggregation against the live service. The local MongoDB URI and database must be available to the app.
- End-to-end role, allocation and CSV checks in `TEST-CASES.md`.

The browser tool could render the loopback preview, but this workspace shell cannot make direct local TCP requests. No database passwords were guessed or entered, and the project archive excludes local environment files and installed dependencies.
