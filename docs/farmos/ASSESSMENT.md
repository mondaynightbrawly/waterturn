# WaterTurn FarmOS: existing application assessment

Assessment date: October 15, 2026. Baseline commit: `d57dcfd`. Phase 0 is documentation and regression validation only. No production deployment or data migration is part of this assessment.

## Current application

WaterTurn is a single-user, local-first irrigation PWA. React 19 and TypeScript render a Vite 6 application. Production dependencies are React, React DOM, Dexie 4, and Lucide icons. Styling is plain CSS, not Tailwind. Vite PWA/Workbox generates an application-shell service worker. No backend, API client, authentication, organization membership, employee accounts, or role enforcement exists.

| Area | Evidence and behavior | Expansion implication |
| --- | --- | --- |
| UI | `src/main.tsx` contains five screens, navigation, application state, notifications, and persistence coordination. `src/Editor.tsx` handles field/source/set/session forms. | Extract feature modules incrementally; do not rewrite timers or replace the UI framework. |
| Domain | `src/model.ts` contains typed fields, sets, sources, sessions/settings, validation, conflicts, timers, median suggestions, and CSV export. | Reuse behavior through an irrigation service; introduce shared entities without duplicating fields. |
| Persistence | `src/storage.ts` uses Dexie database `waterturn`, IndexedDB version 1, table `state`, key `farm`; the entire schemaVersion-1 farm document is saved in one transaction. | Good small single-user storage; unsuitable as the shared server database. Whole-document saves grow expensive with inventory, activity, and attachments. |
| Concurrency | Saves compare the last loaded whole document with the stored document and reject stale-tab edits. | Preserves local edits across tabs, but provides neither distributed transactions nor multi-user synchronization. |
| Offline | Production service worker precaches the app shell. IndexedDB records remain on the browser. | Preserve offline irrigation; service-worker caching alone does not synchronize records. |
| Deployment | `.github/workflows/pages.yml` has only `workflow_dispatch`. Node 24 builds/tests; Pages uploads `dist/`. Vite base is relative. | Static frontend remains viable. Pages cannot securely execute private APIs, hold server secrets, or serve as a multi-user database. No deployment triggered during this audit. |
| Privacy | No runtime farm-data fetch/upload, tracking, external accounts, or location permissions found in application source. Browser notifications require opt-in. | Keep synthetic test data and explicit opt-in for future external connections. Local data is not protected from other users of the same browser profile. |
| Backups | JSON version checking, reference/time validation, preview, confirmed full replacement, atomic save; CSV history export. | Preserve version-1 importer and add explicit migration/export paths; never silently replace a backup format. |
| Demo | `src/demo.ts` constructs fictional fields and sessions on request. | Reuse for module demonstrations; add synthetic FarmOS fixtures separately. |

## Working irrigation features to preserve

- Fields with crop, acreage, irrigation method, default source/duration, metadata, and archive status; ordered sets and multiple source capacities.
- Explicit start/stop/pause/resume and atomic stop/start move. Pausing releases capacity but prevents a second open turn on the same set. Resume rechecks capacity.
- Absolute-timestamp elapsed time with pause exclusion, overnight/DST duration handling, per-second display, approaching/overdue text, and device-clock-jump warning. Target expiry never changes physical or recorded water state automatically.
- Plans remain distinct from actual activity; editable timeline/week schedule and source-capacity warnings with explicit override recording.
- Historical snapshots of field/set and source labels, editable notes/records, archive preservation, search and filters, operational duration summaries, and median suggestions based on qualifying completed sessions.
- Light/dark/system themes, mobile navigation, notifications while running, JSON replacement backups, CSV export, and production offline reload.

Not implemented: recurring turns, water operators, measured water volume, water-rights records, multi-user sharing, durable cloud backup, maps, crop seasons, cattle, equipment, tasks, inventory, financial accounting, or immutable server audit trails. Existing crop strings are descriptive field attributes, not crop-season records.

## Test inventory and practical coverage

`src/model.test.ts`: timers/reopen/edit, overnight and both DST transitions, pause duration, start/stop/move and failed-move preservation, duplicate sets, capacity overrides and pause/resume capacity, historical labels/archive references, planned overlaps and peak concurrency, duration suggestion filtering/rounding, IndexedDB backup roundtrip/rejected replacement, stale writes, invalid references/times, CSV escaping/formula mitigation.

`src/Editor.test.tsx`: explicit suggestion acceptance and persistence failure feedback, using React Testing Library/jsdom.

`tests/workflow.spec.ts`: two Chromium workflows at a mobile viewport, with a desktop screenshot in the second. They exercise field/source/two-set creation, start/move/stop/history/export, reload/offline reload, demo warnings, pause/resume, weekly schedule, invalid import and confirmed replacement.

Baseline validation results are recorded in ROADMAP.md. There is no measured line/branch coverage percentage, cross-browser matrix, PostgreSQL migration suite, authorization suite, financial reconciliation suite, or complete accessibility audit. Existing browser tests check timer rendering but do not advance a controllable browser clock through all timer states; domain tests supply explicit timestamps. Do not describe these tests as full FarmOS acceptance coverage.

## Expansion risks and recommended controls

| Risk | Required response |
| --- | --- |
| A large central screen/form couples unrelated modules | Extract app shell, irrigation screens, repository interface, and form components in small tested changes. |
| New module replaces existing field IDs | Keep IDs and historical snapshots; shared fields must remain the same records referenced by irrigation. |
| New database/version destroys a browser farm | Backup-first, additive versioned migration, rollback plan, legacy importer, counts and duration reconciliation. |
| UUID assumption breaks demo IDs (`f0`, `s00`, etc.) or imported IDs | Retain legacy strings via explicit ID mapping; never blindly cast imported IDs to UUID. |
| Overdue active water is treated as finished | Preserve manual control; forecast occupancy is uncertain until a stop is recorded. Review conflict edge cases before expanding scheduling. |
| Static UI roles are mistaken for security | No sensitive multi-user trial until real authentication, backend policy enforcement, and direct API authorization tests pass. |
| A module writes another module's inventory/cost records twice | Transactional commands, idempotency keys, canonical cost postings, and links to original source events. |
| A shared activity ledger becomes a second editable source of truth | Write canonical module record and activity entry together. Read projections may be rebuilt; never create independent duplicate costs. |
| Imported data becomes a generic JSON dumping ground | Central per-entity schemas, explicit units, typed references, size limits and staged validation. |
| Attachments inflate backups or expose documents | Separate private object storage and metadata when approved; do not include private attachments in static assets. |
| PWA update or hostname change strands local data | Keep origin/database name stable, test old cached clients against migrations, and provide export/import across origins. |

## Recommendation

Retain React, TypeScript, Vite, Dexie, CSS, and the existing irrigation domain behavior. Build a modular monolith before considering separate services. Start FarmOS as a synthetic-data, single-device foundation with explicit local-only labeling. Design PostgreSQL tenant boundaries now, but provision no backend until a private multi-user milestone is agreed. See ARCHITECTURE.md for the proposed relational model and security boundary; ROADMAP.md defines the first proposed implementation milestone and later gates.
