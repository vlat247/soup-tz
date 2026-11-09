# Dashboard UI verification

Branch: `feature/dashboard-ui`. Recorded 10 November 2026. These are targeted implementation checks, not final assignment acceptance or a performance benchmark.

## Automated checks

Captured console/header files normalize terminal line endings and trailing whitespace; result messages, failures and values are retained.

- `npm run check`: passed twice during integration; captured output is in [check-01.log](check-01.log) and [check-02.log](check-02.log). The second check covers inspection disabling during viewport updates and the accessible export label. A later server-log review exposed a date-label hydration mismatch; the final post-fix run [check-04.log](check-04.log) passes all checks.
- ESLint: no warnings. Strict TypeScript and Next route generation: passed.
- Vitest: the final run passes 109 tests across two files (58 fixture tests and 51 numerical/view tests, including timestamp regression cases). Earlier integration runs passed 104 tests before those cases were added.
- Generated catalog: all 20 committed summaries match their regenerated sources.
- Production build: passed; all 20 run routes were prerendered.
- The intermediate [check-03.log](check-03.log) failed TypeScript checking on a test-only Intl getter spy. Replaced the incompatible spy with descriptor save/restore; final strict typing and all tests pass.
- An initial development hydration error also occurred: browser ICU formatted “Nov 1 at 12:00 UTC” while Node formatted “Nov 1, 12:00 UTC”. Fixed by constructing the fixed English label from UTC date getters, independent of ICU punctuation. The regression checks assert exact labels; a fresh final production load displayed “Snapshot Nov 1, 12:00 UTC” after the worker charts loaded and exposed no warnings/errors. The original failure excerpt is retained in [hydration-failure.txt](hydration-failure.txt).
- Earlier interactive lint failed because `ArrowDown` and `ArrowUp` imports were unused. They were removed before the saved successful checks. That initial console output was not saved as a separate log; this note retains the failure and correction.

## Observed browser checks

Used the in-app browser against `next dev` on local port 3000, then `next start` on local port 3001. Tests used desktop 1280×800, intermediate 900×800, and mobile 390×844 viewports. Temporary viewport overrides were reset afterward.

| Check | Observed result |
| --- | --- |
| Run navigation | All 20 links are present. Direct routes load the selected run; root and `/runs` return HTTP 307 with location `/runs/run-001`, recorded in [http-root.txt](http-root.txt) and [http-runs.txt](http-runs.txt). |
| Search and empty results | “million” yields run-020. A nonexistent phrase shows “No matching runs”; Reset filters restores the list. |
| Combined filters and sort | With issues + Failed yields five runs. Last valid loss sorting places the all-invalid loss run last and labels source steps for earlier valid readings. |
| Million-point rendering | Loss peak 12 is visible at step 500,000 in the full-range Canvas chart. Exact-step inspection returns 12. Range 499,990–500,010 reports 21 finite readings and retains maximum 12. |
| Invalid latest value | run-009 shows latest loss NaN at step 3,999 and separately labels last valid loss at 3,998. Step 400 inspection shows NaN while learning rate and gradient remain finite. |
| Keyboard inspection | Right arrow from step 400 moves to 401, updates readings, and updates the polite status text. Home on the tab list returns to Metrics; Right activates Data quality. This checks exposed DOM state, not a full screen-reader session. |
| Missing interval | run-014 range 590–630 visibly leaves the line open between 599 and 620. Inspecting 610 discloses the gap and selects nearest recorded step 620. Applying a range returns focus to its trigger. |
| Conflicting duplicates | run-012 step 700 displays Conflicting and exposes both original loss values, 0.5753684404213275 and 12, in the source table. Latest gradient norm is explicitly Conflicting. |
| All-invalid loss | run-019 shows “No finite readings in this interval”; its learning-rate and gradient charts remain available. |
| Negative and constant values | Production run-017 visibly crosses zero and preserves negative loss. Production run-018 draws a constant 0.75 loss with a nondegenerate linear axis. |
| Mobile layout | 390px document scroll width equals its 390px client width on tested all-invalid and million-point screens. Drawer search, filtering, sorting and run selection work; selecting a run closes the drawer. |
| Intermediate layout | 900px layout displays the constant chart and retains an accessible name for the icon-only Export summary button. |
| Production worker | The production bundle loads run-020 and renders all three metric charts from its million source rows. |
| Switching and updates | Rapid navigation from run-020 through run-009 to run-017 ends with run-017 metadata, summaries and chart. Last 10% followed by All steps on run-020 resolves to the full range. Reload returns the same source snapshot and peak. These spot checks are not an exhaustive race test. |
| Export | Downloaded `run-020-summary.json` parses as JSON, identifies run-020, contains 1,000,000 source rows and loss maximum 12. Retained as [export-run-020.json](export-run-020.json). |
| Unknown route | `/runs/run-missing` displays Run not found with a working link to the first run. |
| Console | Final production warning/error query returned an empty list. |

## Visual evidence

- [Production desktop preview](preview.jpg): steady convergence at 1280px.
- [Full desktop dashboard](desktop-1280.jpg): all three charts and inspector.
- [Million-point spike and exact inspection](million-spike-1280.jpg).
- [Mobile dashboard](mobile-390.jpg): development build at 390px.

Full-page captures briefly resize the page, which can show the real Updating chart state while the worker recomputes for the changed drawable width. The separate viewport preview was captured after the update completed. Development screenshots include the Next development indicator.

## Scope and remaining evidence

No timing or memory budget is claimed. A browser baseline renderer, comparable before/after production traces under 4× CPU throttling, actual tab-memory measurements, automated pixel assertions, comprehensive race/failure injection, axe auditing and screen-reader testing remain outstanding. Deployment and submission materials remain separate work. Numerical raw-output mode exists but is not a captured browser baseline. The current inspector exposes up to 20 duplicate rows (all supplied fixtures fit); arbitrary large duplicate-group pagination and a pixel-column inspector are not implemented.

AI assistance produced and reviewed the implementation, unit tests and documentation. Browser actions and the assertions above were performed during this implementation session; they are not invented benchmark results.
