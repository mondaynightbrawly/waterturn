# FarmOS phase reviews and implementation evidence

Branch: `development/farmos-phases`. Baseline: `d57dcfd`. The user approved continuing through Phase 7 and selected local PostgreSQL/API with no paid services. This is an unreleased local development pilot; it does not certify the complete long-term specification or a production private-data installation. No merge to main or deployment is included.

## Phase 1 — foundation review

Delivered farm/property records; stable associations to existing irrigation fields; worker assignment labels; editable tasks with due date, priority, recurrence, actual time and notes; weekly task view; a configurable farm home; cross-module search; Farm Activity Ledger; and full version-2 backup/import support. Mobile navigation provides four primary actions plus More. The optional connected FarmOS demo is fictional, requires confirmation and never loads automatically.

Migration preserves original IDs, labels, timestamps, pauses, notes and archive flags. A schema-version-1 farm is validated, copied into an original backup and upgraded in one IndexedDB transaction; storage failure aborts the operation. The original backup is exportable in Settings. Explicit local clearing removes current records, migration backups and pending snapshots, and rejects stale-tab deletion.

Evidence: migration preservation/failure/roundtrip tests, idempotent task completion, physical legacy IndexedDB upgrade in Chromium, optional demo/widget persistence, farm/task/offline browser workflow, and all original irrigation regression tests.

Adaptation: preserve the original irrigation screen implementation in the app component rather than rewrite it. New screens and operational domain modules are separate. Further source extraction can be reviewed without changing records. Logical backup schema version 2 is distinct from Dexie's internal database version 3 (native IndexedDB version 30).

## Phase 2 — crop and fieldwork review

Delivered configurable crop-name entry with reused suggestions; annual crop seasons and perennial establishment information; variety, end use, dates, acres, seeding/target-yield/fertility fields; rotation history; fieldwork categories and linked operator/equipment/input quantities; chemical application fields and jurisdiction/label notes; harvest loads/cuttings, moisture/grade/destination and crop cost capitalization into inventory.

Evidence: the browser workflow creates a season, records a production expense, harvests 200 tons into inventory and verifies the resulting records after reload. Unit tests cover atomic failure, allocation by planted acreage and exact total cost preservation. Original crop labels are preserved rather than guessed into historical crop seasons.

Adaptation: bulk fieldwork distributes costs, hours, minutes, fuel, input quantities and acreage across selected seasons, assigning rounding remainders to the final record. No commodity conversions or agronomic recommendations are invented. Chemical form requirements are captured explicitly; a configurable jurisdiction/retention rules engine remains future work and no compliance guarantee is made.

## Phase 3 — cattle review

Delivered individual and headcount-managed groups; animal identity/lineage/profile data; staged CSV import with preview and atomic confirmation; dated weights/ADG; reproduction/calving/weaning records; treatments and withdrawal warnings; animal movement history, including carrying costs across enterprises; ingredient feeding and saved recipes; FIFO inventory withdrawal with known/unknown dry matter; individual and headcount sales; optional direct-beef reservation/processing information.

Evidence: CSV parser/duplicate/import rollback tests; dated ADG calculations; FIFO ration consumption and retry safety; withdrawal override requirements; individual finishing margin and group cost reconciliation; headcount sales; cross-enterprise carrying-cost transfer; browser feed-to-inventory workflow.

Adaptation: individual animals and headcount groups are never counted twice. Sales consume individual costs and the appropriate share of unassigned group costs. Internal movements do not create external revenue. Withdrawal expiry is not slaughter clearance. Beef reservation deposits/balances are currently informational; a partial-payment/customer receivables subledger remains future work. Group-level weight observations and advanced reproductive analytics remain extensions beyond the implemented individual measurements and event history.

## Phase 4 — equipment review

Delivered asset register, make/model/year/serial/location/status, purchase value, hours/miles, notes and linked documents; monotonic meter readings with explicit correction history; due-by-date/hours/mileage maintenance and intervals; repair/service notes, labor/cost/downtime; linked work orders; recurrence; and repair-cost allocation.

Evidence: browser asset/service workflow; meter rejection/correction and service recurrence unit tests; direct expense and allocation reconciliation. Completing service records its expense once; it does not silently declare all equipment faults resolved.

Adaptation: meter-only tasks have no fabricated calendar deadline. Meter/fieldwork readings activate the linked task when the threshold is reached. New intervals create a new task. Profile edits cannot bypass meter history. Dedicated depreciation/warranty models and QR labels remain future extensions; the registry has informational purchase values, notes and attachments.

## Phase 5 — integrated financial review

Delivered enterprise budgets; actual expense/revenue records; integer-cent balanced postings; explicit cash/inventory/crop-WIP/cattle-WIP/expense/revenue accounts; FIFO cost layers and movements; cost allocation with documented basis; corrective expense reversals; crop cost per acre/recorded unit; observed livestock gain/feed-cost metrics; operating margin and remaining WIP; and modeled price/yield/cost scenarios.

Evidence: the silage example reconciles $10,000 recorded production cost → 200 tons inventory → feed withdrawal → cattle WIP, with no fictitious revenue or duplicate consolidated expense. Tests cover fractional-cent allocation, partial stock consumption, location transfers, corrupted backup rejection, individual/group sales, cost transfer across enterprises, reversals, zero-denominator scenarios and immutable actuals. Browser reporting exports CSV; cash-flow and operational enterprise reports remain distinct.

Adaptation: use Decimal arithmetic for quantities and allocation, with integer USD cents for postings. Harvest quantity alone cannot invent production cost. Model results never post into actuals. These management calculations need accountant-reviewed cost-recognition/valuation policies before real business use; they are not tax/accounting certification. Multi-currency, loans, financing, government programs, cash forecasting and full AR/AP are long-term financial extensions, not falsely completed here.

## Phase 6 — maps, reports, private API and sync review

Delivered local interactive field sketches with validated optional GeoJSON/rings and export; crop/irrigation/fieldwork overlays; editable boundaries; manual field/weather/soil observations; text/PDF/image attachments with size/type restrictions; printable/CSV reports; a combined agricultural calendar; local PostgreSQL migrations and authenticated API; all five roles and manager financial-read scope; owner member administration; assigned employee tasks and scoped reports; explicit owner snapshot queue/upload, persisted pending state, conflicts and reconciliation; and previewed import of an existing local farm into an empty authenticated server organization.

Evidence: direct API tests use two fictional organizations and all five roles, including unauthorized direct IDs, financial projections, CSRF/origin, revocation, unassigned employee restrictions, last-owner protection and configurable manager scope. PostgreSQL tests verify a non-superuser/non-RLS-bypass role, tenant policies/composite links and independently balanced financial journals. A real dump restores successfully into an isolated temporary database. Browser tests verify competing-server-change conflict handling with local preservation, explicit reconciliation/upload/logout, local maps, documents, reports, reload and offline operation.

Adaptation: use per-entity JSONB records with tenant-scoped relational links and typed financial posting tables as a transitional PostgreSQL pilot. This does not pretend every table from the long-term logical schema is already physical. Server command/record audit stores authenticated actor, command, affected entity/version and hashes without copying private document bodies into audit logs. Bootstrap credentials are separate from the API runtime configuration and never bundled.

Remaining production gates: automatic per-record multi-user sync/merging, shared-device cache partition/purge policy, secure public HTTPS hosting, production identity recovery/MFA/session operations, validated retention policies, independent security review, operational monitoring and sustained backup/restore ownership. The current sync is **manual owner snapshots**, not background synchronization. Local owner data remains readable on that browser after API logout, so synthetic data is required during this pilot. No paid map/weather provider, GPS permission or public backend was introduced.

## Phase 7 — optional intelligence and integration review

Delivered opt-in local read-only insights with visible record sources; maintenance/cost/irrigation/low-stock queries; recorded-use stock depletion projections with explicit assumptions; and a provider-neutral context-preparation contract that enforces destination, data-scope and sharing consent before preparing an external context. No network transport or credentials are implemented for external providers.

Evidence: a browser check confirms insights do not mutate stored data. Tests reject disabled/unapproved scopes/destinations/sharing and verify only selected fields enter a prepared context. Forecast tests explain missing usage data and preserve actual records.

Adaptation: deterministic local answers provide value without pretending to be an AI model or sending farm data elsewhere. External AI, weather, telematics, scale/EID, sensor and accounting integrations remain disabled. Real providers require specific informed data-sharing consent, credential setup, cost decisions and backend role checks. No automatic gate control or agronomic/veterinary recommendation is implemented.

## Verification and review materials

Current executed checks (updated with the review commit):

- Production TypeScript/Vite/PWA build and separate server TypeScript check.
- 49 unit/component/domain/migration/export tests.
- 11 direct API/PostgreSQL security/restore/setup tests.
- 8 Chromium browser workflows, including physical legacy migration, original irrigation, optional FarmOS demo/widgets, connected operations, documents/maps/insights, offline reload and sync conflict/reconciliation.

Passed, skipped and unrun claims must remain distinct: no skipped tests are counted above; cross-browser/device field trials, production deployment validation, external integrations and independent security/accounting review have not been performed. No line/branch coverage percentage is claimed.

See README.md for reproducible local setup, first-owner creation without a default password, backup commands, browser/server test separation and manual deployment boundaries. No real farm, employee, bank or livestock data was used. No production deployment was triggered.
