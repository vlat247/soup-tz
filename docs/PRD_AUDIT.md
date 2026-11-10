# Dashboard progress against the PRD

Updated 10 November 2026 after merging `pref/optimization` into `main` for GitHub Pages deployment. The final `npm run check` at `d8192b0` passed 597 tests in 19 files, lint, strict types, all 20 exact catalog summaries and a production build; the [current verification record](../evidence/optimization/verification.md) records its actual checks. The historical [silent-failure checkpoint](../evidence/silent-failers/verification.md) at `1aaeeca` passed 585 tests across 17 files, lint, types, catalog consistency and build; 60 source audit cases; nine Node presentation environments; and targeted failure/recovery checks. Earlier checkpoint results remain historical evidence.

The core monitor and previously identified list behavior gaps are implemented. **A final assignment SHIP verdict is not established**: required before/after 4× CPU traces, actual hover timing and tab-memory measurements are absent, and the short note remains a draft. The user subsequently authorized deployment of the public repository on GitHub Pages; publication and hosted smoke checks are in progress. This audit distinguishes local product behavior from assignment delivery evidence.

This branch adds descending valid-loss sorting, unavailable values last in both directions, a distinct empty-catalog state, search-focus recovery and an opt-in raw/reduced browser comparison harness. Current targeted browser checks cover both sort directions, Enter-to-reset search focus, exact loss 12 at step 500,000 and ArrowRight to 500,001, a three-step viewport around the spike, All steps reset and a 360px layout with three canvases and drawer Enter/Escape focus recovery. Run-019 correctly shows no finite loss while its other metrics plot; ArrowRight switches Metrics to Data quality. The retained 60-case source audit covers 300 viewports, 900 metric results and 3,891 inspection groups/pages with unchanged fixture fingerprints. No comprehensive browser or accessibility certification is claimed.

Current production smoke at `d8192b0` confirms HTTP 200 for all 20 run pages, HTTP 404 for unknown runs, diagnostics and the default-disabled benchmark, actual worker rendering and exact spike inspection, the invalid-only loss state, and Enter-to-recover from an unknown run. No console warnings/errors were captured. Historical production smoke at `1aaeeca` additionally verifies tagged invalid export and a 360px layout. These are targeted local production observations, not deployment acceptance; see the [current evidence](../evidence/optimization/verification.md).

## Chart decision

The supplied rainfall/flow screenshot combines filled series with independent vertical scales, including an inverted rainfall scale. That arrangement does not resolve an unmet investigation need in this monitor. Loss, learning rate, and gradient norm already have separate labeled plots sharing the same training-step range, as required by DETAIL-02.

Keep those three charts. The earlier optional rainfall-style quality timeline is deferred. The implementation now includes a conflict-marker legend, an on-demand reduction explanation, and explicitly labeled visible-range maxima. The chart model adds bounded linear display coordinates for extreme numeric domains while retaining exact raw step/value dimensions. The palette follows the user's later black/cream/orange interface decision with separate metric colors.

## Evidence used

- Historical [dashboard integration check](../evidence/dashboard-ui/check-04.log) and [browser record](../evidence/dashboard-ui/verification.md): the prior 109-test checkpoint, targeted desktop/narrow-screen observations, screenshots, and production worker smoke checks. Earlier failures remain retained.
- Latest [independent source report](../evidence/silent-failers/source-validation.json): all 20 fixtures, 1,086,106 fixture rows, seeds 1–40, 300 viewport checks, 900 metric checks and 3,891 exact inspection groups/pages. Expected facts use separate raw-column scans and independent BigInt bucket membership; source fingerprints remain unchanged.
- [Session tests](../tests/unit/run-session.test.ts) and retained [first](../evidence/charts/session-01.txt)/[second](../evidence/charts/session-02.txt) outputs: deterministic fake-worker replies cover identity, geometry, page-selection, failure, retry, and retained-snapshot sequences. [Worker-boundary tests](../tests/unit/run-worker.test.ts) cover malformed messages and failed replacement loads separately.
- [Chart-model tests](../tests/unit/chart-model.test.ts): source/display mapping, precise ticks, null breaks, conflict markers, narrow zoom ranges, and the installed ECharts coordinate engine in SVG mode. These geometry checks are not automated Canvas pixel assertions.
- Historical [chart verification record](../evidence/charts/verification.md): all 20 runs, 364 source/DOM comparison assertions, targeted 360/768/1440px observations, reviewed diagnostic screenshots, pagination, production smoke checks, and retained failures. Its saved 279-test integration check and production diagnostics HTTP 404 result apply to that checkpoint.
- Historical [downsampling record](../evidence/downsampling/verification.md): exact bucket/column tests and targeted production browser checks. Isolated Node timings retain a fragmented-case p95 regression and exclude browser rendering/worker messaging.
- Historical [silent-failure record](../evidence/silent-failers/verification.md): 585-test integration pass, response deadlines, renderer recovery, truthful labels/exports, nine Node locale/time-zone environments and targeted development-browser fault scenarios. These checks use the real dashboard/worker with in-component A/B switching; they are not full router-race or automated browser tests.
- Current [optimization record](../evidence/optimization/verification.md), [run-list tests](../tests/unit/run-list.test.ts) and [benchmark-protocol tests](../tests/unit/benchmark-protocol.test.ts): list correctness, bounded measurement bookkeeping and the exact scope of current browser checks. The comparison harness is not a saved performance trace or tab-memory result.
- [Run browser](../src/features/dashboard/dashboard-shell.tsx), [run detail](../src/features/dashboard/run-dashboard.tsx), [chart model](../src/features/charts/chart-model.ts), [ECharts renderer](../src/features/charts/metric-chart.tsx), [pure session controller](../src/features/runs/hooks/run-session.ts), and [numerical model](../src/features/runs/model/prepare.ts).

"Implemented" below means the behavior exists for the supplied fixtures with the stated evidence. It does not certify every browser, viewport, failure sequence, or assistive technology. "Partial" identifies missing behavior or required verification. No percentage-complete estimate is used because missing release evidence cannot be averaged away.

## Requirement audit

### Data

| PRD IDs | Status | Findings |
| --- | --- | --- |
| DATA-01–04 | Implemented, unit verified | Exactly 20 reproducible runs, required defective telemetry, source provenance, and exactly 1,000,000 rows with loss 12 at step 500,000. |
| DATA-05 | Implemented diagnostic coverage; browser matrix partial | Clean, zero, negative, constant, divergent and all-invalid fixtures exist. Empty/singleton/rejected-step cases and subnormal, adjacent, tiny, and opposite-extreme finite metrics have source/axis tests. The development-only diagnostic route exercises applicable cases with the real Canvas component; targeted screenshots do not cover every device/DPR. |
| DATA-06 | Implemented, unit verified | Source columns remain intact; sorted indexes, conflict classes and finite conflict extrema preserve original evidence. |
| DATA-07 | Implemented | Synthetic labels, fixed snapshot metadata and dataset information explain that statuses describe fixtures. |

### Run list and detail

| PRD IDs | Status | Findings |
| --- | --- | --- |
| LIST-01–02 | Implemented, targeted manual checks | All runs have links. Name/ID search, status and quality filters, and requested sort keys exist. |
| LIST-03 | Implemented, unit and targeted browser checks | Ascending and descending last-valid-loss orders compare source numbers, keep unavailable values last and break ties deterministically by ID. Latest invalid/conflicting states remain labelled; earlier sorting values retain their actual step. |
| LIST-04 | Implemented | Every row shows name, ID, latest observed step, latest loss state, and quality context. Loss sorting additionally exposes an earlier last-valid reading and its step when the latest state is unavailable. |
| LIST-05 | Implemented | Empty catalog and no-matches states are distinct. Reset filters and Clear search restore search focus; Enter-to-reset was checked in the browser. The bundled catalog is synchronous, so no artificial remote list-loading/failure flow is needed. |
| DETAIL-01 | Implemented, targeted manual/HTTP checks | Valid direct routes, initial redirects and recoverable unknown-run view work. |
| DETAIL-02 | Implemented, unit and targeted diagnostic checks | Three metric charts, empty-metric messaging, constant domains, and singleton markers exist. Coordinate tests and retained singleton/empty/constant screenshots add rendering evidence; exhaustive browser coverage remains open. |
| DETAIL-03 | Implemented, unit/manual checks | Latest invalid/conflicting states are explicit; earlier unambiguous readings carry their actual step. |
| DETAIL-04 | Implemented, independent source checks | Charts say "Visible max" and use raw visible valid-step domains, including finite duplicate-conflict readings. Whole-run cards stay separate and unchanged by zoom. Rejected-step observations are preserved/countable but excluded from metric extrema. |
| DETAIL-05 | Implemented, unit/catalog checks | Source/unique-step totals, invalid and missing readings, duplicate/conflict totals, gaps and rejected-step count are exposed. |
| DETAIL-06 | Implemented, session tested | Snapshot disclosure separates fixed UTC source time/version from ISO `loadedAt`. Replacement summary/frame/load time commit together; zoom, hover and failed refresh do not advance retrieval metadata. Export includes `loadedAt`. |

### Chart behavior

| PRD IDs | Status | Findings |
| --- | --- | --- |
| CHART-01 | Implemented; browser acceptance partial | Raw-domain extrema and the exact peak marker preserve the known spike. Exact integer bucket membership fixes a demonstrated omitted endpoint; independent rational oracles supplement 32 seeded million-point intervals. Production inspection at 500,001 shows its actual 0.2478 reading alongside column maximum 12 at 500,000. Full automated Canvas/DPR coverage remains. |
| CHART-02 | Implemented, numerical/targeted manual checks | NaN/Infinity/missing states interrupt their metric; no zero substitution or `connectNulls`. Other valid metrics remain available. Automated rendered invalid-neighbor assertions remain part of TEST-02 closure. |
| CHART-03 | Implemented, unit and targeted diagnostic checks | Stable sorting, per-metric duplicate resolution, breaks and conflict extrema work; diamonds have a "Conflict min / max" legend. Inspector pages expose all original rows with 20-row limits, normalized/clamped offsets and original indexes. A 45-row group is checked across three pages. |
| CHART-04 | Implemented, unit/manual checks | Declared fixed cadence drives gap detection, line breaks and nearest-source gap disclosure. The supplied runs do not declare variable cadence. |
| CHART-05 | Implemented; broader browser verification partial | Independent raw domains, spacing-aware labels, exact source values, and bounded linear display coordinates cover extreme finite magnitudes. ECharts coordinate tests assert geometry and label positions; targeted diagnostic screenshots cover the real renderer. Full browser/DPR/locale combinations remain. |
| CHART-06 | Implemented | Smoothing and ECharts sampling are disabled. |
| CHART-07 | Implemented, targeted manual checks | Charts share range inputs, presets, zoom and reset. Integer boundaries and single-step intervals are supported. |
| CHART-08 | Implemented, unit/targeted browser checks | Nearest source step, tie rule, actual readings, invalid states, duplicate context and keyboard movement exist. Original column extrema and finite/invalid/missing/conflict/gap counts supplement exact-step inspection. Production Enter on the maximum button selects the original spike step; an empty gap column stays empty even when exact inspection selects a nearby recorded step. |
| CHART-09 | Implemented | Linear-only product; zero and negative values are retained. No logarithmic control needs to be added. |
| CHART-10 | Implemented | On-demand source/reduction disclosure explains fewer plotted points and possible omitted local detail; fragmented output is labeled "Disconnected extrema". Column inspection uses the shared drawing budget and original observations, with no invented average or one-physical-pixel promise on wider charts. No lossless-rendering claim is made. |

### State, accessibility and responsiveness

| PRD IDs | Status | Findings |
| --- | --- | --- |
| STATE-01 | Implemented for asynchronous work | Detail load and viewport recomputation have feedback; no fabricated zero cards. The bundled list renders synchronously and needs no fabricated loading delay. |
| STATE-02 | Implemented; targeted recovery checks | Distinct empty-catalog, no-results, unknown-run, all-invalid, worker-error and chart-error states exist. Failed/stalled refresh and renderer retry were checked in the development browser; broader browser coverage remains a verification limit. |
| STATE-03 | Implemented; targeted browser coverage | Fake-worker tests cover A/B/A cancellation and late/replayed identities. In the development harness, an old A load released after selecting B leaves B intact. This uses actual dashboard/worker components with in-component run selection; full router navigation races remain unverified. |
| STATE-04 | Implemented; targeted browser coverage | Failed same-run refresh visibly retains the prior complete frame, source timestamp and successful-load timestamp. Enter on Try again recovers. Controlled development-browser evidence complements deterministic session tests; full announcement/assistive-technology checks remain. |
| STATE-05 | Implemented; targeted browser coverage | Identity and geometry guards protect frames, columns and inspection. Held Last 25% followed by Last 10% resolves to 4499–4999 on all three charts; held inspection 100 followed by 200 commits only 200. Malformed range data fails visibly. Full browser scheduling coverage remains. |
| STATE-06 | Implemented; targeted browser coverage | Native retry is manual. Sent requests have a 30-second deadline (10 seconds in the development harness); dropped-load timeout and retry were checked. Renderer failure removes its canvas while other metrics remain; Enter on Retry chart restores it. Background-tab timers can fire late. |
| UX-01 | Implemented; targeted keyboard checks | Enter-to-reset restores search focus, ArrowRight advances exact source inspection, and the mobile drawer supports Enter/Escape with focus recovery. Earlier checks cover refresh/chart retry and column extrema. This is not a complete keyboard or assistive-technology matrix. |
| UX-02 | Token checks pass; rendered coverage partial | Shell text, placeholder, boundary and focus color pairs pass calculated contrast checks in the current evidence. Text/shape indicators exist. These source-token calculations do not establish every rendered control, chart or state. |
| UX-03 | Implemented; assistive-technology check missing | Bounded chart descriptions and textual inspection exist. No actual screen-reader session is recorded. |
| UX-04 | Targeted widths verified; broader coverage partial | Current 360px checks show no page overflow, three canvases and usable keyboard drawer navigation. Earlier checks cover gap/metadata and locally scrolling column details at 360px, million-point charts at 768px, and invalid/conflict states at 1440px. Text zoom, broader state combinations and device/DPR coverage remain unverified. |
| UX-05 | Implemented; verification partial | Loading/errors and explicit selections have live regions; hover does not flood announcements. Reduced-motion CSS exists. Failure announcements and reduced-motion behavior still need verification. |
| UX-06 | Node matrix complete; browser matrix pending | Nine fresh processes verify actual en-US/de-DE/fr-FR × UTC/Asia-Almaty/Los-Angeles defaults and stable explicit en-US/UTC output, including date/DST boundaries. Exact text preserves signed zero and scientific labels avoid finite overflow. Browser locale/hydration and UI numeric-sort environment coverage remain. |

### Performance and automated evidence

| PRD IDs | Status | Findings |
| --- | --- | --- |
| PERF-01–03 | Missing measurement evidence | No recorded production first-useful-chart, zoom or hover measurements under 4× CPU throttling. Existing build/test durations are not these metrics. |
| PERF-04 | Missing measurement evidence | No absolute/incremental tab-memory, switch peak or release measurements. Typed-array size arithmetic is not tab memory. |
| PERF-05 | Comparison harness implemented; measurements missing | `/benchmark` compares main-thread raw data with worker/reduced data using the same fixture and Canvas adapter. Production requires explicit opt-in; the default route is 404. Development smoke completed one load, 30 zooms and 30 scripted inspections per variant, without CPU throttling. These command timings exclude pointer input and end at a paint proxy. No matched 4× CPU traces or tab-memory results are recorded. |
| TEST-01 | Independent/generated coverage implemented; browser partial | Raw-source oracles, 40 adversarial seeds, seeded million-point intervals, and ECharts geometry assertions supplement original cases. Full automated Canvas pixel/clip and device/DPR checks remain. |
| TEST-02–03 | Source and chart-option coverage implemented; browser partial | Invalid classes, gaps, ordering, duplicate conflicts, metric independence, exact breaks/markers, and bounded fragmented output are checked. Targeted Canvas observations exist; an automated browser assertion suite remains. |
| TEST-04 | Independent source/coordinate coverage; browser partial | Source summaries, domains, provenance, exact signed zero, finite extremes, pagination and tagged export round-trips are tested. Nine Node presentation environments pass. Full browser locale/time-zone and Canvas/DPR checks remain. |
| TEST-05 | Session tests and targeted browser faults; matrix partial | Fake transport and renderer tests cover deadlines, stale replies and recoverable failures. Manual development-browser faults verify retained freshness, old-run/range/inspection rejection, malformed data, timeout, draw retry and zero-size recovery. Full router/browser locale and automated Canvas coverage remain. |
| TEST-06 | Partial | Targeted interaction, responsive and development-browser recovery observations exist. There is no automated browser interaction/error-recovery suite or complete keyboard/assistive-technology matrix. |

## Delivery status

| Artifact | Current state |
| --- | --- |
| Repository | Public repository `vlat247/soup-tz`; `pref/optimization` is merged into `main`. The prior core checkpoint was tested at `d8192b0`; Pages-specific validation and publication are in progress. |
| Deployed URL | Destination: `https://vlat247.github.io/soup-tz/`. The user authorized GitHub Pages deployment; workflow completion and hosted smoke checks remain pending. |
| Test output | Final check at `d8192b0` passed 597 tests/19 files, lint, strict types, all 20 exact catalog summaries and production build. The initial 585-test branch check and earlier failures/reruns remain retained. |
| Performance evidence | Raw/reduced browser harness and historical Node samples exist. Required before/after 4× CPU traces, actual hover timing and tab-memory measurements remain absent. |
| Final note, at most two pages | [Working draft](submission/NOTE_DRAFT.md) exists; final measurements, verdict and rendered page-count verification remain pending. PRD/TRD do not substitute for it. |
| Reflection | Draft reflects the recorded exact-bucket/oracle failure and remaining browser concerns; it does not claim independent candidate observations. |
| AI disclosure | Draft names actual agent assistance, accepted/changed directions and verification scope. No independent human review is invented. |

## Recommended next work

1. Keep the final 597-test output and targeted local production/keyboard observations with the tested revision. Do not relabel historical counts as current results.
2. Capture required before/after first-render, zoom and actual hover Performance evidence at 4× CPU throttling, plus tab memory. The harness alone does not close this requirement. Preserve failed attempts and measurement limitations.
3. Finalize the short note, reflection, AI disclosure and evidence-based verdict. Complete the authorized GitHub Pages deployment and verify the published URLs. Sending the assignment email still requires an explicit user instruction.

Broader router/locale/device automation and assistive-technology coverage remain useful follow-up work. They are disclosed limits; the original brief does not prescribe our entire matrix, numerical budgets or sample counts as additional assignment prerequisites.

The brief requires data truthfulness, usable interactions, silent-failure checks, before/after performance with 4× CPU slowdown, tab memory and delivery artifacts. Exact budgets, sample sizes, the environment matrix and some UI details are our specification decisions. Keep that distinction visible when prioritizing work. The missing required evidence is enough to prevent a SHIP verdict, even though the core interface works.
