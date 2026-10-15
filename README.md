# WaterTurn

A local-first, responsive Progressive Web App for farmers managing manual surface irrigation. No backend, accounts, API keys, analytics, or farm-data uploads.

## Development

Requires Node.js 22 or 24 and npm. Use the existing checkout; cloud tasks are already isolated.

```sh
cd /workspace/waterturn
npm ci --cache /workspace/.npm-cache
npm run dev
```

Production and validation (browser tests use system Chromium; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` on other machines):

```sh
npm run build
npm test
npm run test:e2e # Uses /usr/bin/chromium in this cloud environment
npm run preview -- --port 4173
```

The application opens empty. Create a water source, a field, and its sets, or explicitly load the fictional demo. Configure source capacity in Fields. Set rotation order by editing each set. Start Water records the real start; Move Water proposes the next set and saves the end and new start in one IndexedDB transaction. A planned turn remains planned until explicitly started. Timers derive from absolute timestamps and exclude pauses. Paused turns release source capacity; resuming checks capacity again. A paused set cannot be started a second time.

History retains field/set and source names captured at session creation. Archiving preserves records. Suggestions use the median of the latest five positive completed durations, require three samples, and round to five minutes. Suggestions represent historical operation, not optimal crop water requirements.

## Data and privacy

Records live in this browser's IndexedDB. Export JSON backups regularly. Deleting browser storage, switching devices, or uninstalling can remove data. Import validates references and timestamps, previews record counts, requires replacement confirmation, and commits atomically. CSV exports completed/canceled records with spreadsheet formula mitigation. Never import untrusted files without reviewing their origin. React renders notes as text.

Production builds register a service worker to cache local assets. After the first online visit, core workflows work offline. HTTPS (or localhost for development) is required for service workers. The development server itself does not install the production service worker. Notifications are opt-in and best effort while running; use a separate alarm for important moves.

## Deploy to GitHub Pages

The manual workflow is `.github/workflows/pages.yml`. Pushing changes does not publish the site.

1. Review the development branch. This repository currently has no remote commits. When you approve publishing this initial version as the repository's main code, push it to `main` from this checkout with `git push origin development/waterturn-mvp:main`. This creates the initial main branch; it is not a pull request or a merge. Do not run this until you approve that action. Later changes can use normal pull requests.
2. On GitHub, open **Settings → Pages** and choose **GitHub Actions** as the build source.
3. Open **Actions → Publish WaterTurn to GitHub Pages → Run workflow**, select `main`, and run it. This is the explicit publication step. Build and automated tests must pass before deployment.
4. After the workflow succeeds, use the URL shown by its deployment job. For this repository, the expected default address is `https://mondaynightbrawly.github.io/waterturn/`; it is not live until deployment succeeds.
5. Open the site online once. Create a source, field, and sets; start/move/stop a turn, reload, export a backup, and test an offline reload. Install it from the browser menu if offered.

GitHub Pages availability depends on repository visibility and your GitHub plan. No backend or API keys are needed. Farm data stays on each browser/device and does not sync. Records entered in a development preview will not appear automatically on the deployed site's different origin; export and import a JSON backup to transfer them.

Alternatively, run `npm ci` and `npm run build`, then upload the **contents of `dist/`** to any HTTPS static host. Vite uses relative asset paths, including for a GitHub Pages repository path. Do not open `index.html` through a `file://` URL; use an HTTPS host or a local preview server.

## Architecture

- `src/model.ts`: models, validation, timers, conflict detection, session operations, suggestions, CSV.
- `src/storage.ts`: Dexie transaction boundary for whole-farm persistence.
- `src/main.tsx`: responsive navigation, dashboard, planning, history, and settings.
- `src/Editor.tsx`: validated field/source/set and session forms.
- `src/format.ts`: presentation helpers.
- `src/demo.ts`: opt-in fictional scenario data.
- `src/model.test.ts`, `src/Editor.test.tsx`, `tests/workflow.spec.ts`: deterministic logic/storage tests and real browser workflow/offline test.

## Limitations

Concurrent edits from a stale tab are rejected; reload that tab before editing again. No cloud sync or permanent storage guarantee. Date/time inputs use device local time; timestamps are absolute. Device-clock jumps warn without rewriting records. Desktop drag/drop, recurring plans, photos, maps, physical controls, and reliable background notifications are excluded. Text notes and basic filters are supported; seasons currently use calendar-year boundaries. Notifications use one configurable warning threshold plus the target-time reminder.
