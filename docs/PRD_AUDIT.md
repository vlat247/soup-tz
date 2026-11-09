# Dashboard progress against the PRD

Reviewed 10 November 2026 on `feature/dashboard-ui`, implementation commit `bfe1ee3`. Compared the existing PRD criteria with source, unit tests, and retained verification artifacts. Application code was unchanged during this audit; checks were not rerun. The PRD introduction was updated because it still described the completed interface as future work.

The core monitor is implemented. **The assignment is not ready for submission: DON'T SHIP under the PRD release gate**, because required performance/memory evidence and delivery artifacts are missing. This is a progress assessment, not the final two-page submission note.

## Chart decision

The supplied rainfall/flow screenshot combines filled series with independent vertical scales, including an inverted rainfall scale. That arrangement does not resolve an unmet investigation need in this monitor. Loss, learning rate, and gradient norm already have separate labeled plots sharing the same training-step range, as required by DETAIL-02.

Keep those three charts. The earlier optional rainfall-style quality timeline is deferred. Existing-chart improvements that do address the PRD are a conflict-marker legend, a concise point-reduction explanation, and explicit labeling of visible-range maxima. No application chart was added or changed in this audit.

## Evidence used

- [Final integration check](../evidence/dashboard-ui/check-04.log): 109 unit tests pass, lint/type checking pass, all 20 catalog summaries match, and production build succeeds.
- [Browser verification record](../evidence/dashboard-ui/verification.md): targeted desktop, 900px and 390px checks, source inspection, million-point spike, gaps, conflicts, invalid values, navigation, download, and production worker smoke checks. Includes screenshots and retained failures/fixes.
- [Fixture tests](../tests/unit/mock-data.test.ts): 58 cases. [Numerical/view tests](../tests/unit/run-view.test.ts): 51 cases, including 25 specified million-point interval/width combinations and UTC hydration regressions.
- [Run browser](../src/features/dashboard/dashboard-shell.tsx), [run detail](../src/features/dashboard/run-dashboard.tsx), [ECharts renderer](../src/features/charts/metric-chart.tsx), [worker controller](../src/features/runs/hooks/use-run.ts), and [numerical model](../src/features/runs/model/prepare.ts).

"Implemented" below means the behavior exists for the supplied fixtures with the stated evidence. It does not certify every browser, viewport, failure sequence, or assistive technology. "Partial" identifies missing behavior or required verification. No percentage-complete estimate is used because missing release evidence cannot be averaged away.

## Requirement audit

### Data

| PRD IDs | Status | Findings |
| --- | --- | --- |
| DATA-01–04 | Implemented, unit verified | Exactly 20 reproducible runs, required defective telemetry, source provenance, and exactly 1,000,000 rows with loss 12 at step 500,000. |
| DATA-05 | Partial diagnostic coverage | Clean, zero, negative, constant, divergent and all-invalid fixtures exist. Empty, singleton and invalid-step numerical cases are tested. Extreme finite metric magnitudes still need diagnostic/axis coverage; invalid large step indexes are not a substitute. |
| DATA-06 | Implemented, unit verified | Source columns remain intact; sorted indexes, conflict classes and finite conflict extrema preserve original evidence. |
| DATA-07 | Implemented | Synthetic labels, fixed snapshot metadata and dataset information explain that statuses describe fixtures. |

### Run list and detail

| PRD IDs | Status | Findings |
| --- | --- | --- |
| LIST-01–02 | Implemented, targeted manual checks | All runs have links. Name/ID search, status and quality filters, and requested sort keys exist. |
| LIST-03 | Implemented for offered sort; specification clarification | Ascending last-valid-loss order places unavailable values last. Descending loss is not offered, so the PRD's "either direction" case has not been implemented or tested. Decide whether both directions are actually needed before expanding the control. |
| LIST-04 | Partial UI | Rows show name, ID, observation count and quality state. Last-valid loss appears only when sorting by loss. Latest observed step and latest loss state are not shown in each row. |
| LIST-05 | Partial | No-results and Reset filters work. A zero-run catalog would use the same no-matches message, rather than a distinct empty-dataset state. The catalog is bundled synchronously; no remote list-loading/failure flow exists. |
| DETAIL-01 | Implemented, targeted manual/HTTP checks | Valid direct routes, initial redirects and recoverable unknown-run view work. |
| DETAIL-02 | Implemented; rendering verification partial | Three metric charts, empty-metric messaging and constant domains exist. Singleton geometry is unit tested; actual singleton pixels have not been checked. |
| DETAIL-03 | Implemented, unit/manual checks | Latest invalid/conflicting states are explicit; earlier unambiguous readings carry their actual step. |
| DETAIL-04 | Partial labeling | Observed maxima come from raw visible-range domains, including finite conflicts. The label says "Observed max" without explicitly saying "in visible range". Whole-run cards are separately named. |
| DETAIL-05 | Implemented, unit/catalog checks | Source/unique-step totals, invalid and missing readings, duplicate/conflict totals, gaps and rejected-step count are exposed. |
| DETAIL-06 | Partial metadata | Fixed UTC snapshot and dataset version are displayed. Separate successful retrieval/refresh time (`loadedAt`) is absent. |

### Chart behavior

| PRD IDs | Status | Findings |
| --- | --- | --- |
| CHART-01 | Implemented; acceptance evidence partial | Raw-domain extrema and explicit peak marker preserve the known spike. Tests cover 25 specified million-point cases; full-range and close-zoom pixels were manually checked. Broader generated/adversarial viewport and automated rendering checks remain. |
| CHART-02 | Implemented, numerical/targeted manual checks | NaN/Infinity/missing states interrupt their metric; no zero substitution or `connectNulls`. Other valid metrics remain available. Automated rendered invalid-neighbor assertions remain part of TEST-02 closure. |
| CHART-03 | Partial presentation | Stable sorting, per-metric duplicate resolution, breaks and conflict extrema work. Conflict diamonds need a visible legend/explanation. All supplied duplicate groups fit the inspector; groups above 20 source rows are truncated without pagination, so arbitrary-group support cannot be claimed. |
| CHART-04 | Implemented, unit/manual checks | Declared fixed cadence drives gap detection, line breaks and nearest-source gap disclosure. The supplied runs do not declare variable cadence. |
| CHART-05 | Implemented; verification partial | Source-based bounds, adaptive ticks, scientific notation and full-precision source table exist. Actual rendered axis labels and extreme metric magnitudes need assertions. |
| CHART-06 | Implemented | Smoothing and ECharts sampling are disabled. |
| CHART-07 | Implemented, targeted manual checks | Charts share range inputs, presets, zoom and reset. Integer boundaries and single-step intervals are supported. |
| CHART-08 | Implemented, unit/manual checks | Nearest source step, tie rule, actual readings, invalid states, duplicate context and keyboard movement exist. |
| CHART-09 | Implemented | Linear-only product; zero and negative values are retained. No logarithmic control needs to be added. |
| CHART-10 | Partial explanation | "Extrema preserved" does not explicitly say fewer points are plotted or explain that some local detail can be omitted. Add concise reduction wording without claiming lossless rendering. |

### State, accessibility and responsiveness

| PRD IDs | Status | Findings |
| --- | --- | --- |
| STATE-01 | Implemented for asynchronous work | Detail load and viewport recomputation have feedback; no fabricated zero cards. The bundled list renders synchronously. Clarify that scope instead of adding artificial list latency. |
| STATE-02 | Partial | No-results, unknown-run, all-invalid metric and worker-error/retry UI exist. Distinct empty-catalog behavior and controlled failed-load/retry evidence are missing. |
| STATE-03 | Implemented guards; required verification missing | Run identity/session cancellation and cleared route state exist. A manual quick switch is recorded; the reproducible delayed A/B response scenario is absent. |
| STATE-04 | Partial | Fixed snapshot/version remain visible, and error feedback says when the previous snapshot is retained. Separate last-successful retrieval metadata and a controlled stale-refresh failure check are missing. |
| STATE-05 | Implemented guards; verification partial | Run/source/request/range/width checks reject obsolete frames. Pending old-geometry inspections are invalidated. Controlled out-of-order reply tests are missing. |
| STATE-06 | Partial | Native retry controls exist without automatic retry loops. A documented way to reproduce diagnostic worker/load failures is missing. |
| UX-01 | Implemented controls; verification partial | Native controls, visible focus, tab keys, inspector keys and focus restoration exist. Complete keyboard-only workflow and failure recovery have not been verified. |
| UX-02 | Acceptance unverified | Contrast improvements and text/shape indicators exist. Complete contrast checks across controls, states and charts remain outstanding. |
| UX-03 | Implemented; assistive-technology check missing | Bounded chart descriptions and textual inspection exist. No actual screen-reader session is recorded. |
| UX-04 | Partial | 1280px, 900px and 390px layouts were checked. Explicit approximately-360px checks remain. Scrollable quality/source tables use unlabeled wrapper divs rather than the labeled regions requested by the PRD. |
| UX-05 | Implemented; verification partial | Loading/errors and explicit selections have live regions; hover does not flood announcements. Reduced-motion CSS exists. Failure announcements and reduced-motion behavior still need verification. |
| UX-06 | Partial test coverage | Explicit en-US formatting, fixed UTC labels and punctuation/date-boundary regressions exist. The specified en-US/de-DE/fr-FR × UTC/Asia-Almaty/Los-Angeles environment matrix has not been exercised. |

### Performance and automated evidence

| PRD IDs | Status | Findings |
| --- | --- | --- |
| PERF-01–03 | Missing measurement evidence | No recorded production first-useful-chart, zoom or hover measurements under 4× CPU throttling. Existing build/test durations are not these metrics. |
| PERF-04 | Missing measurement evidence | No absolute/incremental tab-memory, switch peak or release measurements. Typed-array size arithmetic is not tab memory. |
| PERF-05 | Missing comparison | Numerical `buildFrame(..., "raw")` exists, but no browser baseline renderer or matched before/after traces have been captured. |
| TEST-01 | Partial | Fixed spike/viewports and handwritten reduction cases pass; rendered examples are manual. Generated invariant cases and automated pixel/clip assertions remain. |
| TEST-02–03 | Numerical coverage implemented; rendered coverage partial | Unit tests exercise invalid classes, gaps, ordering, duplicates, conflicts and metric independence. Renderer-level failure cases are not automated. |
| TEST-04 | Partial | Source summaries/domains/inspection, tiny-value formatting and UTC regressions pass. Rendered ticks, additional rounding boundaries and extreme magnitudes remain. |
| TEST-05 | Partial | Manual switch/reload checks and numerical scale rules exist. Controlled race/stale-refresh/failure cases and full locale/time-zone coverage remain. |
| TEST-06 | Partial | Targeted interaction and responsive browser observations are recorded. There is no automated browser interaction/error-recovery suite. |

## Delivery status

| Artifact | Current state |
| --- | --- |
| Repository | Source, setup commands, fixtures, tests and limitations exist locally. Dashboard implementation is in four feature commits through `bfe1ee3`; no dashboard-branch push was performed in this workflow. Final fresh-checkout and published-revision verification remain. |
| Deployed URL | Missing from the implementation evidence; no deployment was performed. |
| Test output | Present, including failures and reruns. The final saved check passes 109 tests. Add explicit reviewed source revision and browser/device metadata to the final evidence bundle; its current dashboard record is primarily branch/date based. |
| Performance evidence | Missing as described above. |
| Final note, at most two pages | Missing. PRD, TRD and this audit do not substitute for it. |
| Reflection | Not prepared from the completed implementation/measurement experience. |
| AI disclosure | A short factual AI-use statement exists in dashboard verification; the final account of accepted/changed suggestions and independent checks remains to be assembled. |

## Recommended next work

1. Close the small existing-UI gaps: list context, visible-range max label, conflict legend, reduction explanation, retrieval metadata and labeled table regions. Resolve whether descending loss and an empty catalog are needed under the fixed synthetic scope; do not silently mark those criteria complete.
2. Add reproducible failure/race and rendered-chart checks. Exercise the locale/time-zone, narrow-width and accessibility requirements; keep actual results and failures.
3. Connect a truthful raw browser baseline and measure it alongside the optimized implementation under the specified conditions. Capture actual tab memory as well as timing. Performance targets are still proposed budgets, not observed results.
4. Publish the reviewed implementation, deploy and smoke-test it, then prepare the rendered short note, reflection, AI disclosure and evidence-based verdict. Sending the assignment email still requires an explicit user instruction.

The brief requires data truthfulness, usable interactions, silent-failure checks, before/after performance with 4× CPU slowdown, tab memory and delivery artifacts. Exact budgets, sample sizes, the environment matrix and some UI details are our specification decisions. Keep that distinction visible when prioritizing work. The missing required evidence is enough to prevent a SHIP verdict, even though the core interface works.
