# WaterTurn FarmOS

A local-first farm/ranch operations development pilot, retaining the original WaterTurn surface-irrigation module. The default browser application needs no account, API key, backend, GPS permission, analytics, or paid service. An optional local PostgreSQL/API pilot supplies authenticated organization access and explicit owner synchronization.

**Development branch:** `development/farmos-phases`. No merge to main or deployment is included in this work. Use synthetic information while evaluating the pilot. See [phase reviews and release limits](docs/farmos/PROGRESS.md).

## Start the browser application

Requires Node.js 24 (Node 22.12+ also supported), npm, and a modern browser.

```sh
cd /workspace/waterturn
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
```

The app opens to Farm Home. Start with a property, fields/water sources, enterprises, inventory items and equipment. Farm Home offers an optional fictional connected FarmOS demo; the Irrigation dashboard retains the original smaller irrigation demo. Loading that demo replaces the entire current farm after confirmation; export a full JSON backup first.

Implemented workflows include properties/shared fields; local worker labels and recurring tasks; activity history; crop seasons, rotation history, fieldwork and bulk fieldwork; harvest inventory; cattle groups/animals/CSV import, weights, reproduction, treatments, feed and saved rations; asset meters/maintenance; FIFO inventory; integer-cent financial postings, allocation, reversals, budgets and scenarios; local field boundaries; reports, attachments, and deterministic read-only insights. These are operational prototype capabilities, not a production accounting/compliance/security certification.

## Validation

```sh
npm run build
npm run typecheck:server
npm test
npm run test:e2e           # Frontend workflows; no database required
npm run preview -- --port 4173
```

Browser tests use `/usr/bin/chromium` in the cloud environment. Elsewhere, install Playwright's Chromium and set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Tests supply synthetic data and timestamps; they do not wait hours for irrigation.

Full database/security/sync validation requires the local backend below:

```sh
npm run backend:setup
npm run test:server
npm run test:e2e:full
```

The server suite creates isolated fictional organizations/users and tests direct API/role boundaries, SQL constraints, revocation and a real dump/restore into a temporary database. The full browser suite starts its own temporary API server. Keep preview port 4173 free. Ordinary `test:e2e` intentionally excludes the API synchronization test so static Pages builds do not require database credentials or Docker.

## Optional local PostgreSQL/API pilot

Requires Docker with a running daemon. This setup uses a pinned official PostgreSQL 17 image, a named local volume and a loopback-only database port. It does not provision a paid resource or deploy a public server.

```sh
npm run backend:setup
npm run backend:dev
```

The API binds to loopback port 8787. Its health endpoint verifies a database connection; private endpoints require an authenticated cookie and organization membership. Use the browser dev server through the `127.0.0.1` hostname on port 5173 to match the default CORS origin. If testing production preview instead, start the API with `FARMOS_WEB_ORIGIN=http://127.0.0.1:4173 npm run backend:dev`.

Setup generates random database credentials in ignored, mode-0600 local files. Runtime `.env.local` contains only the application database URL and origin; bootstrap administration credentials remain in `.local/admin.env` and `.local/postgres.env`. Never commit or publish these files. The application role has neither superuser nor RLS-bypass privileges. No login or default password is created automatically.

To create the first owner and an empty fictional organization, provide a password of at least 12 characters via stdin. In Bash, this avoids putting the password in shell history or command arguments:

```sh
read -r -s -p 'New local owner password: ' FARMOS_OWNER_PASSWORD
printf '\n'
printf '%s' "$FARMOS_OWNER_PASSWORD" | npm run backend:user -- owner "Fictional Farm"
unset FARMOS_OWNER_PASSWORD
```

Open Administration → Private local API pilot, sign in, inspect the server revision and explicitly import the server organization before uploading its records. Export the existing browser farm first. To move an existing local farm into a newly created empty server organization, use **Preview existing local farm import**, review its counts/data scope, confirm the copied-farm queue, then upload explicitly. Local records remain unchanged until you import the server farm. Nonempty destination merging is rejected. After editing an already imported server farm, queue a snapshot and explicitly upload it. Uploads use revision checks and idempotent receipts. Conflicts retain local data and require reconciliation; no last-write-wins overwrite occurs. Pending snapshots persist in IndexedDB, but uploading requires an authenticated running session. This pilot uses manual snapshot sync, not automatic multi-device record merging or guaranteed background sync.

Owners can manage local authenticated members and grant a manager financial read scope. Employees receive assigned server tasks; accountants receive financial reporting, managers operational data, and read-only users limited records. Worker labels in local mode are not authentication. Clearing farm data removes migration backups and pending uploads too. Local owner snapshots remain accessible in that browser after API logout; use synthetic data and clear/export local records on a shared device. Production multi-user caching, provider recovery/MFA, independent review and deployment hardening remain release gates.

Stop the API process normally and use `docker stop waterturn-farmos-db` to stop the database. The named volume retains records. Do not remove the volume as a troubleshooting shortcut.

## Irrigation behavior and data migration

Existing field/set/source/session IDs, historical labels, timestamps, pauses, notes and archive flags are preserved. A legacy schema-version-1 record is validated, copied to an original-backup table and upgraded to schema version 2 within one IndexedDB transaction. Failure aborts the migration. Export the original irrigation migration backup from Settings if needed. Version-1 JSON import remains supported; current full exports use schema version 2.

Start Water records the physical start. Move Water closes and starts sessions atomically at one timestamp. Planned turns never start automatically; overdue timers remain active. Pausing excludes paused duration and releases source capacity while preventing a duplicate open turn on that set. Timers derive from timestamps across overnight/DST transitions. Notifications are best effort while running, not reliable closed-app alarms.

## Inventory and financial policies

- Quantities use explicit base units with no automatic commodity conversions. FIFO lots preserve purchased/produced origin, location, cost basis, moisture/dry-matter assumptions and immutable movement history.
- Money is integer USD cents; Decimal arithmetic allocates quantities and costs. Journal debits and credits sum to zero. Cost-based inventory values reconcile to posted inventory accounts.
- Record production costs before harvest. Harvest transfers recorded crop work-in-process to inventory. Feeding transfers inventory value into cattle work-in-process without creating a sale or cash revenue.
- Cash flow, incurred production inputs, capitalized inventory, remaining WIP and recognized operating expense/margin are separate reports. Scenario estimates never modify actual postings.
- Equipment expense allocations reference the original cost, avoiding duplicate cash expenses. Bulk fieldwork splits direct costs and usage by planted acreage. Expense reversals preserve the original record and require downstream costs to be reconciled first.
- Individual cattle sales include recorded individual costs and a proportional share of unassigned group cost. Financial outputs need reconciliation with an accountant before business use; this app is not a replacement for accounting software or a tax return.
- Treatment restrictions require independent verification; the app never declares slaughter safety. Chemical record requirements must be reviewed for the applicable product label and jurisdiction.

## Privacy, backups and offline use

Browser records use IndexedDB, not a cloud database. They can be lost when browser data is deleted, the device changes or the app is uninstalled. Export full JSON regularly. Import previews and validates the complete backup before confirmed atomic replacement. CSV reports mitigate spreadsheet formulas. Local attachments (plain text/PDF/PNG/JPEG, max 2 MB each) are included in backups and downloaded without inline execution. Full local data is limited to 19 MB to remain within the JSON import size limit.

Production assets are precached by the service worker for offline use. The development server does not install that production worker. No farm data goes to weather, AI, bank, mapping or tracking providers. Local insights are explicitly deterministic queries with visible source records; external AI and integrations remain disabled.

For PostgreSQL, retain credentials securely and use independent backups. A local development backup can be created without placing credentials on the command line:

```sh
umask 077
mkdir -p .local/backups
docker exec waterturn-farmos-db pg_dump -U postgres -d farmos -Fc > .local/backups/farmos.dump
```

Keep encrypted copies outside the development machine for a real installation. Restore into a separate database first, verify counts, permissions and financial reconciliation, then plan any controlled recovery. The automated server test rehearses isolated restore. Never restore over existing user data without an approved recovery plan.

## Static deployment stays manual

The existing `.github/workflows/pages.yml` still runs only via `workflow_dispatch`. Pushing a branch does not deploy anything. Main currently contains the original reviewed WaterTurn release; this FarmOS branch must be reviewed before any merge or publication.

For a future approved static release: choose GitHub Actions in Settings → Pages, manually run the Pages workflow against the reviewed branch, and verify the resulting site online/offline. Only `dist/` is published. The relative Vite base supports the repository path. GitHub Pages hosts the frontend only; it cannot run the private API or PostgreSQL. A publicly hosted frontend must never contain real farm records, database URLs or private documents in its assets. A public private-data pilot needs a separately approved HTTPS API/auth/backup deployment.

## Project layout and planning

- `src/model.ts`, `src/Editor.tsx`: retained irrigation model and forms.
- `src/storage.ts`: atomic local persistence, migration backup and pending-sync metadata.
- `src/farmos/domain.ts`: shared farm/property/task/activity models and validation.
- `src/farmos/operations.ts`, `modules/`: connected domain command facade and separate crop/cattle/equipment/inventory/ledger/validation modules.
- `src/farmos/FarmScreen.tsx`, `OperationsScreen.tsx`: farm workflows and reusable forms.
- `src/farmos/advanced.tsx`, `geometry.ts`: maps, reports, attachments and local insights.
- `src/farmos/sync.ts`, `SyncPanel.tsx`, `MemberAdmin.tsx`: explicit API access and sync controls.
- `server/`, `db/migrations/`, `scripts/`: local API, authorization, relational pilot storage, migrations and setup.
- `src/**/*.test.*`, `server/security.test.ts`, `tests/*.spec.ts`: domain, migration, UI, direct API/SQL and real browser tests.

See [assessment](docs/farmos/ASSESSMENT.md), [architecture](docs/farmos/ARCHITECTURE.md), [living roadmap](docs/farmos/ROADMAP.md), and [current phase reviews](docs/farmos/PROGRESS.md). The architecture document describes the long-term fully typed schema; the current PostgreSQL pilot uses entity JSONB records with tenant-scoped relational links and typed financial posting tables. It is not a completed production migration of every proposed table.
