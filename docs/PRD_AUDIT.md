# Dashboard progress against the PRD

Updated 10 November 2026 for `feature/downsampling`, implementation commit `f877330`. The [latest verification record](../evidence/downsampling/verification.md) documents 525 passing tests across 14 files, lint, strict types, catalog consistency and a production build, plus targeted production browser checks. Later singular-label corrections received focused lint; the observation label was also checked in development. Earlier [data-validation](../evidence/data-validation/verification.md) (448 tests), [chart](../evidence/charts/verification.md) (279 tests and targeted 360/768/1440px checks), and dashboard (109 tests) checkpoints remain historical evidence.

The core monitor is implemented. **The assignment is not ready for submission: DON'T SHIP under the PRD release gate**, because required performance/memory evidence and delivery artifacts are missing. This is a progress assessment, not the final two-page submission note.

The downsampling checkpoint fixes a demonstrated floating bucket-boundary defect, uses an independent exact-integer oracle, and exposes original column extrema/quality counts through the validated worker/session inspector. All 60 audit cases pass: 300 viewports, 900 metric results and 3,891 exact inspection groups/pages; the 20 fixture fingerprints are unchanged. A simpler singleton scan path has isolated Node measurements, including a retained tail regression. These changes strengthen CHART-01/08/10, STATE-05 and TEST-01/04/05; they do not close the remaining browser, accessibility, performance or delivery gates in the tables below.

## Chart decision

The supplied rainfall/flow screenshot combines filled series with independent vertical scales, including an inverted rainfall scale. That arrangement does not resolve an unmet investigation need in this monitor. Loss, learning rate, and gradient norm already have separate labeled plots sharing the same training-step range, as required by DETAIL-02.

Keep those three charts. The earlier optional rainfall-style quality timeline is deferred. The implementation now includes a conflict-marker legend, an on-demand reduction explanation, and explicitly labeled visible-range maxima. The chart model adds bounded linear display coordinates for extreme numeric domains while retaining exact raw step/value dimensions. The palette follows the user's later black/cream/orange interface decision with separate metric colors.

## Evidence used

- Historical [dashboard integration check](../evidence/dashboard-ui/check-04.log) and [browser record](../evidence/dashboard-ui/verification.md): the prior 109-test checkpoint, targeted desktop/narrow-screen observations, screenshots, and production worker smoke checks. Earlier failures remain retained.
- Latest [independent source report](../evidence/downsampling/source-validation.json): all 20 fixtures, 1,086,106 fixture rows, adversarial seeds 1–40, 300 viewport checks, 900 metric checks and 3,891 exact inspection groups/pages. Expected facts come from separate raw-column scans, with source-byte hashes, rather than the production reducer as its own oracle. Exact BigInt division detects bucket-boundary drift independently of production quotient/remainder arithmetic. [Validation tests](../tests/unit/run-validation.test.ts) add generated million-point intervals, malformed boundaries, and complete duplicate pagination.
- [Session tests](../tests/unit/run-session.test.ts) and retained [first](../evidence/charts/session-01.txt)/[second](../evidence/charts/session-02.txt) outputs: deterministic fake-worker replies cover identity, geometry, page-selection, failure, retry, and retained-snapshot sequences. [Worker-boundary tests](../tests/unit/run-worker.test.ts) cover malformed messages and failed replacement loads separately.
- [Chart-model tests](../tests/unit/chart-model.test.ts): source/display mapping, precise ticks, null breaks, conflict markers, narrow zoom ranges, and the installed ECharts coordinate engine in SVG mode. These geometry checks are not automated Canvas pixel assertions.
- Historical [chart verification record](../evidence/charts/verification.md): all 20 runs, 364 source/DOM comparison assertions, targeted 360/768/1440px observations, reviewed diagnostic screenshots, pagination, production smoke checks, and retained failures. Its saved 279-test integration check and production diagnostics HTTP 404 result apply to that checkpoint.
- Latest [downsampling verification record](../evidence/downsampling/verification.md): the [525-test integration check](../evidence/downsampling/check-final.stdout), original column extrema/quality tests, worker/session reply validation, and production observations of spike/conflict/gap inspection, Enter-to-inspect, zoom context reset and local mobile table scrolling. The production console recorded no warnings or errors. Isolated Node timings retain all samples and a fragmented-case p95 regression; they exclude browser rendering and worker messaging.
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
| LIST-03 | Implemented for offered sort; specification clarification | Ascending last-valid-loss order places unavailable values last. Descending loss is not offered, so the PRD's "either direction" case has not been implemented or tested. Decide whether both directions are actually needed before expanding the control. |
| LIST-04 | Implemented | Every row shows name, ID, latest observed step, latest loss state, and quality context. Loss sorting additionally exposes an earlier last-valid reading and its step when the latest state is unavailable. |
| LIST-05 | Partial | No-results and Reset filters work. A zero-run catalog would use the same no-matches message, rather than a distinct empty-dataset state. The catalog is bundled synchronously; no remote list-loading/failure flow exists. |
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
| STATE-01 | Implemented for asynchronous work | Detail load and viewport recomputation have feedback; no fabricated zero cards. The bundled list renders synchronously. Clarify that scope instead of adding artificial list latency. |
| STATE-02 | Partial acceptance | No-results, unknown-run, all-invalid metric and worker-error/retry UI exist. Pure tests now exercise failed load/retry. Distinct empty-catalog behavior and full browser failure recovery remain open. |
| STATE-03 | Implemented, deterministic session tests; browser injection pending | A/B/A cancellation, late/replayed replies and wrong-run messages are tested with a fake transport. The hook also clears old route content. This closes the pure-controller gap, not the browser delayed-response scenario. |
| STATE-04 | Implemented, deterministic session tests; browser injection pending | Failed same-run refresh retains the prior complete frame/summary/load time and explicit previous-snapshot state. Successful replacement publishes all together. Controlled browser failure/announcement verification remains. |
| STATE-05 | Implemented, deterministic session and targeted browser tests | Run/source/request/range/width checks reject obsolete or mismatched frames and column facts. Resize, zoom, stale hover, and changed source-page responses are tested; newer selections cannot be overwritten by old pages. Production zoom clears old column context and the next inspection uses the new viewport. Full browser scheduling coverage remains. |
| STATE-06 | Implemented retries; browser evidence partial | Native retry has no automatic loop. Fake-worker tests reproduce construction, load, message, viewport and inspection failures; worker-boundary tests cover malformed requests. There is no user-facing/browser fault-injection harness yet. |
| UX-01 | Implemented controls; verification partial | Native controls, visible focus, tab keys, inspector keys and focus restoration exist. The column maximum action was checked with Enter and visible focus in production. Complete keyboard-only workflow and failure recovery have not been verified. |
| UX-02 | Acceptance unverified | Contrast improvements and text/shape indicators exist. Complete contrast checks across controls, states and charts remain outstanding. |
| UX-03 | Implemented; assistive-technology check missing | Bounded chart descriptions and textual inspection exist. No actual screen-reader session is recorded. |
| UX-04 | Targeted widths verified; broader acceptance partial | Earlier checks cover 360px gap/metadata and precise labels, 768px production million-point charts, and 1440px production invalid/conflict states. Latest 360px production gap inspection keeps the page at 360px while the column table scrolls locally in a 328px region with 663px content. Browser text zoom, wider state combinations, and device/DPR coverage remain. |
| UX-05 | Implemented; verification partial | Loading/errors and explicit selections have live regions; hover does not flood announcements. Reduced-motion CSS exists. Failure announcements and reduced-motion behavior still need verification. |
| UX-06 | Partial test coverage | Explicit en-US formatting, fixed UTC labels and punctuation/date-boundary regressions exist. The specified en-US/de-DE/fr-FR × UTC/Asia-Almaty/Los-Angeles environment matrix has not been exercised. |

### Performance and automated evidence

| PRD IDs | Status | Findings |
| --- | --- | --- |
| PERF-01–03 | Missing measurement evidence | No recorded production first-useful-chart, zoom or hover measurements under 4× CPU throttling. Existing build/test durations are not these metrics. |
| PERF-04 | Missing measurement evidence | No absolute/incremental tab-memory, switch peak or release measurements. Typed-array size arithmetic is not tab memory. |
| PERF-05 | Missing comparison | Numerical `buildFrame(..., "raw")` exists, but no browser baseline renderer or matched before/after traces have been captured. |
| TEST-01 | Independent/generated coverage implemented; browser partial | Raw-source oracles, 40 adversarial seeds, seeded million-point intervals, and ECharts geometry assertions supplement original cases. Full automated Canvas pixel/clip and device/DPR checks remain. |
| TEST-02–03 | Source and chart-option coverage implemented; browser partial | Invalid classes, gaps, ordering, duplicate conflicts, metric independence, exact breaks/markers, and bounded fragmented output are checked. Targeted Canvas observations exist; an automated browser assertion suite remains. |
| TEST-04 | Independent source and coordinate coverage implemented; matrix partial | Raw summaries/domains/provenance, pagination, precise axis ticks, subnormal/adjacent/extreme values, and existing UTC regressions are checked. The complete browser locale/time-zone matrix remains. |
| TEST-05 | Session failures/races covered; browser and locale matrix partial | Fake-worker tests cover stale run/frame/inspection/page replies, failed refresh, worker failures and retry. Controlled browser fault injection and full locale/time-zone coverage remain. |
| TEST-06 | Partial | Targeted interaction and responsive browser observations are recorded. There is no automated browser interaction/error-recovery suite. |

## Delivery status

| Artifact | Current state |
| --- | --- |
| Repository | Source, setup commands, fixtures, tests and limitations exist locally. Downsampling implementation is reviewed through `f877330` on `feature/downsampling`; subsequent copy-only changes have focused checks. Final fresh-checkout and published-revision verification remain. |
| Deployed URL | Missing from the implementation evidence; no deployment was performed. |
| Test output | Historical and current outputs are retained, including failures and reruns. The current integration check at `f877330` passes 525 tests across 14 files plus lint, strict types, catalog consistency, and production build. The verification record documents later copy-only checks, environments and evidence limits; reviewed revision metadata should accompany the final published bundle. |
| Performance evidence | Isolated Node engine samples exist, with a retained fragmented-case regression. Required browser baseline/4× CPU traces and tab-memory measurements are missing as described above. |
| Final note, at most two pages | Missing. PRD, TRD and this audit do not substitute for it. |
| Reflection | Not prepared from the completed implementation/measurement experience. |
| AI disclosure | A short factual AI-use statement exists in dashboard verification; the final account of accepted/changed suggestions and independent checks remains to be assembled. |

## Recommended next work

1. Finish browser acceptance: controlled delayed responses and failed refresh/retry, Canvas pixel/clip assertions, the locale/time-zone and responsive matrix, keyboard-only recovery, contrast and actual assistive-technology checks. Preserve failures and follow-up evidence; pure session tests do not close these browser gates.
2. Resolve descending loss and empty-catalog requirements under the fixed synthetic scope. The downsampling follow-up now provides column extrema/quality inspection alongside exact-step pagination; broader browser/accessibility coverage still needs the checks above.
3. Connect a truthful raw browser baseline and measure it alongside the optimized implementation under the specified conditions. Capture actual tab memory as well as timing. Performance targets are still proposed budgets, not observed results.
4. Publish the reviewed implementation, deploy and smoke-test it, then prepare the rendered short note, reflection, AI disclosure and evidence-based verdict. Sending the assignment email still requires an explicit user instruction.

The brief requires data truthfulness, usable interactions, silent-failure checks, before/after performance with 4× CPU slowdown, tab memory and delivery artifacts. Exact budgets, sample sizes, the environment matrix and some UI details are our specification decisions. Keep that distinction visible when prioritizing work. The missing required evidence is enough to prevent a SHIP verdict, even though the core interface works.
