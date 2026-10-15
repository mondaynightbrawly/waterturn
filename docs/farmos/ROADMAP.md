# WaterTurn FarmOS living roadmap

Updated October 15, 2026. Owner: project owner; implementation decisions require review against the product brief. This roadmap refines the supplied phases into smaller, testable releases. Changes to scope, status, or assumptions belong in this document with the associated review.

## Status and decisions

| Item | Status | Evidence / decision |
| --- | --- | --- |
| Phase 0: repository audit | Completed | ASSESSMENT.md, baseline `d57dcfd` |
| Phase 0: architecture and relational design | Proposed for review | ARCHITECTURE.md; no schema migration executed |
| Irrigation regression baseline | Passed October 15, 2026 | Production TypeScript/Vite/PWA build; 19 unit/component/storage tests; 2 Chromium browser workflows |
| FarmOS implementation | Not started | No first implementation milestone agreed yet |
| Backend/auth provider | Deferred | Compare options at private-data gate; no service provisioned |
| Production deployment | Unchanged by Phase 0 | Manual workflow retained; no workflow dispatched or Pages setting modified |
| Real farm data / paid services | Out of scope for initial experiment | Synthetic fixtures only; approval needed before connecting outside systems |

Validation commands, run from `/workspace/waterturn`:

```sh
npm run build
npm test
npm run test:e2e
```

Playwright uses system Chromium in this environment. This is current-instance regression evidence, not evidence of live Pages behavior, a fresh cloud restoration, cross-browser support, authorization, or future database compatibility. Unit tests: 19 executed/passed; browser tests: 2 executed/passed; no new FarmOS tests are claimed. Coverage percentage was not measured.

## Best first implementation milestone: M1A, local FarmOS shell and daily work

**Proposed; awaiting agreement.** Keep the initial experiment single-user, on-device, and synthetic. This is a bounded subset of Phase 1, not an attempt to implement every proposed module.

Concrete outcome: open a unified farm home, create a farm/property, reuse an existing field, create a task linked to that field, mark it complete, see it in the activity history, and continue the existing irrigation workflow with its old records intact.

Scope:

1. Extract app navigation and the current irrigation screens into a module without changing timer/session rules. Keep Irrigation's Dashboard, Schedule, Fields, History, and Settings accessible during transition.
2. Add organization/farm and property metadata plus property association for existing fields. The organization is a local organizational record, not a login or security boundary. Preserve field IDs, defaults, notes, snapshots, and archived history.
3. Add a shared work-order/task model: title, description, due instant, priority, status, optional worker-name reference, field link, estimated/actual minutes, completion notes. Workers are local labels, not authenticated employees. No invitations, permissions, or payroll.
4. Add transactional Farm Activity Ledger entries for task creation/completion and newly recorded irrigation changes. Existing irrigation history remains canonical; do not fabricate historical actors or creation events during import.
5. Add a home dashboard with irrigation status/next move and due/overdue tasks; quick add for irrigation/task; basic search over implemented records. Hide unsupported module actions.
6. Introduce a repository/service boundary and tested additive local schema migration. Preserve version-1 import; export version-2 backup with a clear schema version and full farm/task/activity data. Keep original backup recoverable.
7. Add desktop and mobile screenshot evidence, updated README, and a review summary on a development branch. No main merge, push to main, deployment, or paid service.

Explicitly outside M1A: interactive maps, crop season planning, equipment registry, inventory, cattle, cost accounting, attachments, cloud sync, server auth/roles, weather, and AI. They remain scheduled below, rather than appearing as nonfunctional screens.

Acceptance checklist:

- [ ] Existing version-1 farm fixture upgrades without ID, timestamp, pause, duration, archive, label, or note loss.
- [ ] Failed migration/save/import leaves the existing farm unchanged; original backup remains recoverable.
- [ ] Version-2 import rejects invalid references; roundtrip includes tasks/activity and original irrigation records.
- [ ] A task can be created, linked to a field/property, edited, assigned a local worker label, completed, and filtered by due date/status.
- [ ] Task/activity changes commit together; retry does not duplicate a completion entry.
- [ ] New irrigation start/move/stop remains manual, atomic where required, and correctly linked to activity history.
- [ ] Existing regression tests pass; add migration fixtures, task rules, repository failure tests and a browser farm/task/irrigation/backup/offline workflow.
- [ ] Dashboard and module navigation work at phone and desktop sizes with keyboard and labeled large controls.
- [ ] UI says “Saved on this device”; it makes no role, sync, durable cloud backup, or private multi-user claim.

Definition of done: the checklist is satisfied, test counts/results and screenshots are recorded, changes are reviewable, and no real data or production deployment is introduced. Agreement to M1A authorizes this bounded implementation, not the entire platform.

## Incremental releases and dependency gates

| Supplied phase / milestone | Deliverable | Prerequisites and key acceptance evidence |
| --- | --- | --- |
| Phase 1 / M1A | Shell, properties/shared fields, daily tasks/activity, local migration/backups | Agreed scope above; all irrigation regressions and old-backup upgrade tests |
| Phase 1 / M1B | Equipment register, meter entries, basic inventory items/lots/locations and immutable quantity movements | M1A; unit-safe quantities, no silent negative balances, FIFO proposal reviewed, transfer/adjustment and backup tests; cost numbers remain labeled estimates until finance is released |
| Phase 1 security gate / S1 | Chosen PostgreSQL/API/auth pilot, organization membership, backend permissions, backup/restore, versioned migration and staged local import | Separate decision before private/multi-user access; two-tenant direct-API tests, column/document scopes, session revocation, audit and restore evidence. Can run alongside later synthetic module work, but cannot be skipped by adding employees to the UI. |
| Phase 2 / M2A | Crop library, crop seasons/perennial stands, fieldwork/labor/equipment-use records, rotation history | Shared fields/assets/tasks; validated rates/units, dates and bulk-entry tests; legacy field crop labels preserved rather than guessed into history |
| Phase 2 / M2B | Harvest loads/cuttings, inventory additions, planting/chemical forms, initial field cost references | M2A + inventory; idempotent harvest-to-inventory transaction, quantity/moisture assumptions, configurable application record requirements; no claim of regulatory completeness |
| Phase 3 / M3A | Locations/groups/animals, identity, membership movements, reproduction/calving/weaning, health/withdrawal records, weights | Stable tenant/entity/reference model; individual vs headcount reconciliation, ADG date/unit tests, treatment visibility, no automatic slaughter-clearance declaration; CSV staging/preview |
| Phase 3 / M3B | Rations, feed deliveries/lot withdrawals, sales and basic performance | M3A + inventory; as-fed/dry-matter validation, headcount snapshots, feeding atomicity and cost references; no nutrition optimization claims |
| Phase 4 / M4 | Maintenance by date/hours/mileage, service/repair/downtime, work-order integration | M1B; meter correction rules, interval tests, overdue scheduling and failure recovery; cost allocations reference canonical expense sources |
| Phase 5 / M5A | Balanced operational ledger, budgets, allocation policies, inventory valuation and internal transfers | Accounting policy review, decimal and currency rules, chart of accounts, cost-layer migration; crop-to-feed reconciliation and duplicate-posting prevention |
| Phase 5 / M5B | Enterprise reports, cash/accrual distinction, crop/cattle closeouts, breakevens and scenarios, optional beef processing/customer balances | M5A + crop/cattle records; zero-denominator tests, cost/revenue reconciliation, explicit estimated/actual assumptions and period inventory; scenarios cannot mutate actuals |
| Phase 6 / M6A | Optional GeoJSON boundaries, maps/overlays and private documents | Reviewed data sharing/permissions; manual field entry remains available; no paid imagery requirement, geometry validation, field-area assumptions, private attachment policy/download tests |
| Phase 6 / M6B | Multi-device offline outbox/sync/conflict resolution, scoped reports and exports, optional weather | S1 + stable command model; retries/revocations/deletions, old-client compatibility, concurrent source starts/inventory consumption, conflict UI and restore drills |
| Phase 7 / M7 | Optional AI/integrations/automation | Separate opt-in and cost/data-sharing review; least-privilege access, provenance, explicit confirmation before writes, no automatic gate control or unsupported agronomic claims |

A phase may contain multiple PRs; the numbering expresses dependencies, not a commitment to launch all features on a fixed date. Do not begin financial production reporting merely because a module can display an estimated cost.

## Acceptance and release gates across phases

For each implementation release:

1. Document changed entities, data ownership, schema/import versions and migration/rollback behavior. Update both architecture and roadmap when a decision changes.
2. Run all irrigation regression tests. Add tests that can fail for the new workflow, not merely render empty navigation.
3. Run migration/import/export and storage-failure tests for schema changes. Test backups from before the change and an old cached client.
4. Where backend auth exists, test all roles and organization boundaries through direct requests, including search/export and attachment download. Before auth exists mark these tests “not applicable: single-device synthetic prototype,” never “passed.”
5. For inventory/costs, require quantity/currency/decimal checks, repeated-command tests, balanced movement/posting tests and documented unit conversion policies.
6. Verify mobile/desktop operation and practical error messages; keep background notifications best effort. Test current production PWA build offline.
7. Record executed counts, failures/skips and limitations; review screenshots. Keep real farm financials, employee data, or animal records out of Git and CI artifacts.
8. Deploy only on explicit approval. GitHub Pages stays manual. Rehearse backups/restores before migrating a private installation.

Required integrated financial scenarios at the relevant release:

- **Silage to feed:** production cost capitalized into harvested inventory, lot withdrawal, cattle feed cost/WIP, zero fictitious cash revenue, correct remaining value, and no duplicate consolidated expense.
- **Equipment:** fieldwork hours + actual repair/fuel posting + documented allocation; fields receive their shares while source expenses appear only once in farm totals.
- **Finishing:** acquisition + feed + treatment + weights + sale/fees produces reconciled margin, cost per gain, and closeout; missing data/zero gain produces an explanation, not invalid division.
- **Irrigation:** planned versus actual turn, assigned maintenance task, labor/cost references and field allocation preserve actual water timestamps and manual confirmation.

## Decisions to revisit before implementation

- Agree to M1A as the first bounded milestone, or prioritize a private backend pilot first. Recommendation: M1A with synthetic data.
- At S1: hosted database/auth option, operating region, owner/operator responsibilities, backup retention/recovery objective, and acceptable monthly budget.
- Before accounting: fiscal/crop-year policy, valuation and cost recognition, overhead allocation, currency/units and professional review of financial definitions.
- Before sync: which records may be cached on shared devices and which conflicts require owner review.

No credentials, personal account access, paid service, or real farm information is needed to agree to or build M1A.
