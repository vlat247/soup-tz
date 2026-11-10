# Soup Training Run Monitor Product Requirements

**Version:** 1.6

**Date:** 2026-11-10

**Status:** Core dashboard implemented; 597-test production check passed, performance evidence incomplete, GitHub Pages deployment verified.

**Companion specification:** [Technical requirements](TRD.md)

**Implementation direction:** [Build approach](BUILD_APPROACH.md) records the simple data pipeline, initial feature choices, and implementation sequence to use with these acceptance criteria.

The monitor helps an engineer decide whether a training run is behaving well enough to continue spending compute. It must expose uncertainty, invalid observations, and divergence instead of presenting a reassuring but misleading chart. The evaluation scenario is a person deciding whether to stop a $500 run; the application provides evidence for that decision and does not control real training infrastructure.

The current delivery includes the Next.js dashboard, [20 deterministic fixtures](MOCK_DATA.md), three ECharts plots, exact summaries/reduction, worker processing, shared ranges, source/column inspection and explicit failure recovery. `pref/optimization` adds descending valid-loss sorting, a distinct empty-catalog state, focus recovery and an opt-in raw/reduced browser comparison harness. The final `npm run check` at `d8192b0` passed 597 tests in 19 files, lint, strict types, all 20 exact catalog summaries and a production build; see [current verification](../evidence/optimization/verification.md). The historical [silent-failure checkpoint](../evidence/silent-failers/verification.md) at `1aaeeca` passed 585 tests in 17 files, lint, types, catalog consistency and build, plus a 60-case independent audit and nine Node locale/time-zone cases. The required production 4× CPU comparison and tab-renderer memory are now recorded at `0eb0e3d`; [production browser evidence](../evidence/performance/verification.md) contains actual Paint correlation, native mouse-movement scope and limits. The measurement build passed 598 tests. The final two-page note gives a qualified SHIP verdict, while disclosing the 55.8 ms hover p95 miss. The requested GitHub Pages deployment from `main` is complete. Code `9b96333` passed the 597-test check locally and in CI; [deployment evidence](../evidence/github-pages/verification.md) records hosted route, asset, worker, spike and recovery checks. See the [progress audit](PRD_AUDIT.md) for evidence and limits; the requirements below retain their Brief/Decision/Target distinctions.

Current targeted browser checks cover both loss-sort directions, keyboard filter reset/focus, exact spike and next-step inspection, a three-step range, All steps reset and mobile drawer keyboard recovery at 360px with no page overflow. Historical production smoke covers truthful invalid export and hidden diagnostic routes. These observations do not establish comprehensive browser automation, a browser locale matrix or assistive-technology conformance.

## 1. Source and decision boundaries

The source is **Soup-Task-05-Frontend-Engineer(1).pdf**, page 1, supplied with the request. Its local source path is `/Users/vlat247/Downloads/Soup-Task-05-Frontend-Engineer(1).pdf`. The attachment specifies the assignment; this PRD translates it into an implementable product scope.

Requirement provenance is explicit:

- **Brief:** A requirement stated in the supplied assignment, including generated data, chart evidence, performance measurements, failure checks, and submission artifacts.
- **Decision:** A proposed implementation or product policy that resolves an unspecified detail. These decisions can change if their replacements meet the brief and preserve the truthfulness guarantees.
- **Target:** A proposed measurable quality objective. The brief requires measured results, but does not prescribe numerical performance budgets.

The brief estimates **4-6 hours of work** and a **48-hour deadline**. The starting event for that deadline has not been supplied; no absolute submission date is assumed. The assignment allows any stack; the user's request selects Next.js. Its email submission instruction is a future deliverable requirement and does not authorize sending email during this setup task.

## 2. Users and product outcomes

### Primary user

A machine learning engineer or researcher reviews active or completed training runs. They need to recognize divergence, unstable gradients, suspicious learning-rate changes, and unreliable telemetry quickly, including on a laptop with limited CPU resources.

### Secondary user

A reviewer evaluates whether the implementation's claims are supported by reproducible tests and measurements. They need to run the project, inspect deliberately broken data, reproduce chart behavior, and find limitations without reverse-engineering the application.

### Desired outcomes

1. Find a run and understand its latest trustworthy observations.
2. Detect an isolated spike even when the chart represents one million samples.
3. Distinguish missing or invalid telemetry from valid numerical values.
4. Explore a suspicious interval without losing its context or silently changing the meaning of the data.
5. Determine whether the evidence justifies shipping the monitor, including a clear negative verdict when it does not.

The key success criterion is correct interpretation, not smoothness or visual density. A fast chart that suppresses evidence of divergence fails the product requirement.

## 3. Scope

### Required for the assignment

- Twenty generated training runs with `step`, `loss`, `lr`, and `grad_norm` observations and the specified defective cases.
- A sortable and filterable run list.
- A run detail page with three metric charts and summary cards.
- Loading, empty, and error states; responsive layout; keyboard operation; sufficient contrast.
- Automated evidence for spike preservation, invalid values, duplicate and unsorted steps, and numerical fidelity.
- Before-and-after performance measurements with a 4x CPU slowdown, plus tab memory for the million-point case.
- Explicit checks for stale data, request races, locale and time zone behavior, smoothing, and logarithmic scales with zero values.
- A repository, deployed application, test output, trace files or screenshots, a note of no more than two pages, a reflection paragraph, AI-use disclosure, and a SHIP or DON'T SHIP verdict.

### Proposed initial product decisions

- Use deterministic synthetic data so the same seed reproduces the same observations and defects.
- Use the training step as the horizontal axis. Use timestamps only for run metadata and freshness information.
- Use linear scales and unsmoothed data by default.
- Ship the first implementation with linear axes only. The log-scale failure check verifies that no implicit log transform or nonpositive-value clipping occurs; optional log controls can be considered later.
- Keep the three charts synchronized to one step range.
- Show data-quality information alongside run health; an invalid value is evidence of a problem, not evidence of a successful run.
- Make the source of summary values and the visible range explicit.
- Use an explicit refresh action and synthetic dataset version. Continuous live ingestion is outside this version.
- Deploy to GitHub Pages, as selected by the user on 10 November 2026. The Pages build statically exports all 20 runs under `/soup-tz/`; local development retains the normal Next.js server mode.

### Non-goals

Real run termination, training orchestration, authentication, collaboration, billing, real backend ingestion, arbitrary uploaded datasets, distributed storage, multi-run chart comparison, alert delivery, and production operational monitoring are outside this assignment. A $500 figure is decision context, not a calculated cost displayed as factual telemetry.

Five-million-point support is a possible live discussion topic in the brief, not an additional implementation requirement. This specification does not pre-write live discussion answers.

## 4. Dataset requirements

| ID | Provenance | Requirement and acceptance criteria |
| --- | --- | --- |
| DATA-01 | Brief | Generate exactly 20 runs. Each observation contains a training step and loss, learning rate, and gradient norm values. Every run has a stable identifier and display name. |
| DATA-02 | Brief | Include non-finite loss observations representing NaN and Infinity, duplicate steps, unsorted steps, and gaps. The fixture manifest identifies the run and source positions for each intentional defect. |
| DATA-03 | Brief + Decision | Include one run containing exactly 1,000,000 source observations and an isolated outlier spike in the middle of its long series. The implemented fixture is `run-020`, with steps 0 through 999,999 and a loss value of exactly 12 replacing the normal value at step 500,000. Preserve that value as an independent test oracle. |
| DATA-04 | Decision | Use a documented seed and dataset version. Two generations with the same inputs produce the same logical data and defect manifest. Run IDs and spike position remain stable across application sessions. |
| DATA-05 | Decision | Include clean reference cases, zero/negative values, constant and all-invalid metric cases, and divergent or unstable trajectories within the 20-run set. Empty, single-point, invalid-step, and extreme-magnitude cases are diagnostic/test-only fixtures outside the 20 listed runs. The TRD records the exact fixture allocation. |
| DATA-06 | Decision | Preserve the original observations or equivalent inspectable provenance. Normalization must not erase evidence of conflicting duplicate values or disguise an invalid value as a missing zero. |
| DATA-07 | Decision | Display generated data as synthetic. Metadata such as status, start time, and last observation time comes from the fixture definition; it is not inferred from wall-clock activity. |

The defect categories may overlap in the smaller runs. Keep invalid/gap/conflict fixtures separate from `run-020` so its source count and isolated spike are unambiguous. The implementation must document the distribution and ensure each required category is independently testable. Missing steps and non-finite values are separate conditions: one is an absent observation, and the other is an observation with an invalid numerical value.

## 5. Core user journeys

### Find a concerning run

The user opens the run list, filters by name or identifier and by quality condition, and sorts by a useful metric or recency. They can identify that a run has invalid or conflicting telemetry before opening it. Selecting a row opens that run's detail route; returning to the list preserves usable search and sort context.

### Investigate a possible divergence

The user opens the million-point run and sees its isolated spike in the complete-range loss chart. They zoom into an interval containing the spike. The spike remains visible and its inspected value matches the source. The learning-rate and gradient-norm charts show the same step interval. Resetting the range restores the full history.

### Inspect unreliable data

The user opens a run with invalid values and sees an explicit data-quality warning. The loss chart contains a visible break or invalid-interval indication rather than a zero or interpolated line. Inspection explains whether the observation is NaN, Infinity, absent, or a duplicate conflict. Summary cards do not present an earlier finite observation as the current value without labeling its actual step and its last-unambiguous-finite meaning.

### Recover from a failed or stale load

The user encounters a failed request, retries, and receives either a retrieved snapshot with its original source time or a clear error. If they switch from run A to run B before A finishes loading, B remains selected and A's late result cannot replace B's charts or cards. If previous data remains visible during refresh, it is labeled as previous data until the retrieved snapshot is committed; receiving the same old source does not make it fresh.

### Review the result with a keyboard

The user filters the run list, opens a run, changes the visible range, navigates observations, reads their values in text, and resets the chart without a pointing device. Focus remains visible and follows a predictable order. Chart meaning is not available only through color or a hover tooltip.

## 6. Functional requirements

### Run list

| ID | Provenance | Requirement and acceptance criteria |
| --- | --- | --- |
| LIST-01 | Brief | Display a list of all available runs with a clear way to open an individual run. The initial successful load exposes all 20 fixtures. |
| LIST-02 | Brief + Decision | Support sort and filter. Initial controls include text search by name/ID, status and quality filters, and sorting by name, last step, and last unambiguous finite loss. Label the loss sort with that meaning; it does not select an arbitrary value from a conflicting final step. Sort direction is visible; ties have a stable ID-based ordering. |
| LIST-03 | Decision | When no unambiguous finite loss exists, place the run after finite loss sort values in either direction. Label unavailable values; do not silently coerce them to zero or treat them as better performance. |
| LIST-04 | Decision | Show name, last observed step, the latest loss state, and data-quality status. If an earlier unambiguous finite loss supports sorting, show its actual step and label it separately. A health or lifecycle label must have a documented source and must not imply that a synthetic run is currently running on real infrastructure. |
| LIST-05 | Brief | Show a distinct no-results state for filters and an empty-dataset state when no runs exist. No-results offers a clear-filter action. Loading and request failure are distinguishable from empty data. |

### Run detail and summaries

| ID | Provenance | Requirement and acceptance criteria |
| --- | --- | --- |
| DETAIL-01 | Brief | Give every run a directly addressable detail route. A valid ID loads the requested run; an unknown ID shows a recoverable not-found state with a route back to the list. |
| DETAIL-02 | Brief | Show separate loss, learning-rate, and gradient-norm charts with metric names and training-step axes. Each chart correctly handles a single observation, an empty metric, and a constant-valued metric. |
| DETAIL-03 | Brief + Decision | Show summary cards for the latest observed step and the three latest metric observations. A latest invalid observation is labeled invalid with its reason; a latest conflicted observation says Conflicting values. An earlier unambiguous finite value may appear only with its own step and a clear last-unambiguous-finite label. |
| DETAIL-04 | Decision | If minimum, maximum, or change statistics are added, compute them from the source data, not from rendered samples. Observed extrema include every finite source value, including conflicts. Label their scope as full run or visible range and show invalid/conflict counts where relevant; do not calculate a change from an ambiguous endpoint. |
| DETAIL-05 | Decision | Display original sample count, canonical step count, invalid counts by metric, gaps, and duplicate/conflict counts in an inspectable data-quality summary. Counts must have clear definitions and match the fixture manifest. |
| DETAIL-06 | Decision | Display source/dataset version and fixed source snapshot time (`snapshotAt`). Record loaded/refreshed time (`loadedAt`) separately as retrieval metadata. Synthetic historical observations must not be presented as current measurements, and reloading an old snapshot does not make its source data fresh. |

### Chart exploration and truthfulness

| ID | Provenance | Requirement and acceptance criteria |
| --- | --- | --- |
| CHART-01 | Brief | The isolated spike remains represented at every supported zoom level whose viewport contains its step, including the full million-point range. Its peak is inside the vertical domain and is not clipped by a domain calculated from averaged samples. A viewport that excludes the spike has no obligation to show it. |
| CHART-02 | Brief | NaN and Infinity never become zero, a finite substitute, or an interpolated bridge. An invalid observation interrupts the relevant metric and is disclosed in text. Other valid metrics at the same step remain usable. |
| CHART-03 | Brief + Decision | Sort source observations by step using stable source order for ties. Resolve duplicates per metric: identical values collapse with their count disclosed; conflicting values become an ambiguous state that breaks the connected line. Draw a clearly labeled observed-range marker showing finite conflict minima/maxima at that step, with all source values inspectable. A mixed finite/invalid conflict also shows an invalid indicator. Do not pick an arbitrary representative or imply interpolation between conflicting values; unaffected metrics remain valid. |
| CHART-04 | Brief + Decision | Indicate missing-step gaps using the fixture's declared expected step cadence. Do not infer missing data merely from uneven spacing when the run declares a variable cadence. A line must not imply uninterrupted measurements across a known gap. |
| CHART-05 | Brief | Axis ticks, summaries, and inspected values use consistent units and documented precision. Rounded labels do not contradict the underlying data; full-precision values are available in the textual observation inspector. |
| CHART-06 | Decision | Use no smoothing in the initial product. Any future smoothing must be explicitly opt-in, labeled, and accompanied by the original series; it cannot satisfy the spike requirement by hiding divergence. |
| CHART-07 | Decision | Provide a shared visible step range, zoom in/out, and reset controls. Wheel or drag interactions may supplement these controls, but keyboard-accessible controls must perform equivalent actions. Boundaries and a zero-width interval are validated. |
| CHART-08 | Decision | Inspect a nearest source observation by step and report the actual sample, not a synthetic downsampled average. Show the selected step, each metric value or invalid reason, and duplicate-conflict context. |
| CHART-09 | Brief + Decision | Default to a linear vertical scale. If logarithmic mode is offered, zero and negative observations cannot be dropped or clamped silently: disable that mode for the affected metric/range with an explanation. Non-finite observations remain disclosed gaps. A documented safe linear-only product satisfies this check. |
| CHART-10 | Decision | Explain that the chart reduces plotted points while retaining specified extrema and discontinuities. Do not claim that every raw point is individually drawn or that visual reduction loses no information. |

“Every zoom level” is a product invariant, not a claim that a finite screenshot suite proves infinitely many viewports. Verification combines a reduction invariant, adversarial/generated viewport tests, and rendered checks at representative widths, device-pixel ratios, and zoom levels. The evidence note must state what remains outside that coverage.

### Loading, failures, and freshness

| ID | Provenance | Requirement and acceptance criteria |
| --- | --- | --- |
| STATE-01 | Brief | Provide loading feedback for run list, detail load, and expensive recomputation. It must not display fabricated zero summaries while work is pending. |
| STATE-02 | Brief | Show empty-data, no-results, unknown-run, and failed-load states with context-appropriate recovery actions. A chart with no finite values explains why it has no line. |
| STATE-03 | Brief | Switching runs rapidly cannot commit results for a previous run. A reproducible delayed-response scenario verifies list selection, heading, cards, and all charts remain associated with the current run. |
| STATE-04 | Brief + Decision | Freshness is explicit and derives from the source snapshot time/version, not retrieval time. When refresh fails, retained previous data is marked stale with its source snapshot/version and a visible failure; last successful retrieval time is separate metadata. A successful refresh replaces all related views atomically without relabeling an unchanged old snapshot as fresh. |
| STATE-05 | Decision | Chart computation results also belong to a run, dataset version, and visible-range revision. An outdated zoom result cannot overwrite a newer range. Errors in a metric panel do not falsely mark the rest of the run as valid. |
| STATE-06 | Decision | Recovery controls are operable by keyboard and do not trigger endless automatic retries. Diagnostic failures are reproducible through documented fixtures or test controls. |

## 7. Accessibility and responsive behavior

| ID | Provenance | Requirement and acceptance criteria |
| --- | --- | --- |
| UX-01 | Brief + Target | All primary workflows are keyboard-operable: search, filters, sorting, navigation, refresh, range controls, reset, and observation inspection. Focus is visible and is not trapped in a chart. See [W3C keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html). |
| UX-02 | Brief + Target | Meet WCAG AA contrast targets for normal text (4.5:1), large text (3:1), and meaningful interface/graphical boundaries (3:1), following [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) guidance. Invalid data and selection are indicated by text or shape as well as color. |
| UX-03 | Decision | Charts have accessible names and summaries. An associated text inspector exposes selected values and quality conditions. Do not place a million observations into the accessibility tree or DOM. |
| UX-04 | Brief + Decision | Support narrow mobile widths around 360 CSS pixels, tablet, and desktop. Controls wrap without overlap; summaries and charts remain readable; horizontal document scrolling is not required. If a data table needs horizontal scrolling, confine it to a labeled region. |
| UX-05 | Decision | Dynamic loading/errors are announced appropriately without flooding assistive technology on pointer movement. Reduced-motion preferences are respected; animation is not required to interpret a change. |
| UX-06 | Brief + Decision | Numeric and time presentation is intentional and testable. Use deterministic `en-US` formatting and explicitly labeled UTC metadata timestamps by default; training steps stay numeric and independent of time zones. Tests exercise `en-US`, `de-DE`, and `fr-FR`, plus UTC, Asia/Almaty, and America/Los_Angeles, to detect accidental environment dependence. |

These accessibility and device targets are acceptance objectives, not a claim of certification. Automated checks are supplemented with manual keyboard and screen-reader inspection of the primary journey.

## 8. Performance requirements and evidence

The brief requires measured first render, zoom response, hover response, and tab memory at one million points, including before-and-after optimization numbers. The measurements must use a production build and report the browser version, device, data seed/version, viewport, CPU setting, and measurement method. Apply the requested 4x CPU throttling to timing traces; explicitly report how the separate memory measurement was obtained.

The opt-in `/benchmark` harness implements a raw/reduced comparison with scripted range and source-inspection commands. Its paint-proxy timings exclude physical input dispatch; they do not satisfy actual hover timing or replace saved traces and tab-memory measurements. Normal production builds keep the route unavailable. The subsequent native mouse-movement probe and saved Performance traces now supply that separate evidence; see [production browser evidence](../evidence/performance/verification.md). It is a controlled comparison shell with the production numerical/worker/renderer pipeline, not an absolute timing claim for the entire deployed dashboard.

| ID | Metric | Proposed target | Acceptance evidence |
| --- | --- | --- | --- |
| PERF-01 | First useful chart | Median at most 2 seconds on the documented reference environment under 4x CPU slowdown | Five independent cold navigations per variant, from navigation start to the first complete million-point chart frame with correct axes and summaries; report median/range and FCP separately, and keep warm results separate. |
| PERF-02 | Zoom response | At most 100 ms at the 95th percentile | At least 30 scripted range interactions after initial load; measure input to correct visible chart update. |
| PERF-03 | Hover/inspection response | At most 50 ms at the 95th percentile | At least 30 pointer/keyboard inspection interactions; measure input to the correct visible/textual value. |
| PERF-04 | Million-point memory | At most 250 MiB incremental steady-state tab memory over the empty/list application baseline | Same browser/process conditions before and after load; report absolute and incremental footprint, peak during load/switch, and release after switching away. State the actual tab-memory method and distinguish it from JavaScript heap. |
| PERF-05 | Before/after comparison | No invented improvement claims | Use the same dataset and measurement conditions; keep both traces and raw measurements. Preserve failures and regressions, with explanation. |

These numbers are proposed budgets, not requirements quoted from the PDF and not measured results. The final verdict must explain missed targets. Correctness blockers cannot be traded for a faster trace. Memory accounting must not present a JavaScript heap reading as total tab memory; if a required measurement cannot be obtained, disclose that evidence gap.

## 9. Verification and release gates

### Required automated evidence

| ID | Test objective | Minimum evidence |
| --- | --- | --- |
| TEST-01 | Preserve a single spike | Million-point full-range case, boundary positions, multiple viewport widths and zoom ranges, plus generated/adversarial cases that assert the reduction invariant. Rendered checks establish that preservation also produces a visible mark. |
| TEST-02 | Preserve invalid semantics | NaN/Infinity, invalid neighbors, all-invalid windows, and invalid observations sharing reduction buckets with finite values. Verify a break/indicator and no zero substitution or line bridge. |
| TEST-03 | Normalize without distortion | Unsorted observations, identical duplicates, conflicting duplicates, and shuffled source records. Assert per-metric duplicate/conflict counts, broken lines at ambiguous steps, preserved conflicting extrema, and equivalent chart semantics regardless of arrival order. |
| TEST-04 | Match numerical values | Source-derived summaries, truthful chart domains/ticks, precision/rounding boundaries, small and large values, and inspection of original observations. |
| TEST-05 | Catch silent failures | Delayed A/B requests, stale refresh, outdated zoom result, locale/time-zone variation, known gaps, no smoothing, and log-scale zero/negative cases. |
| TEST-06 | Support interaction and states | Run-list sort/filter, direct routing, loading/empty/error recovery, keyboard range/inspection workflow, and representative responsive layouts. |

Each test artifact records the command, environment, dataset version, and complete output. Failing output remains available alongside fixes and reruns. A passing test suite alone does not prove that all browsers render every possible viewport correctly, that a user interprets the chart correctly, or that synthetic telemetry models a real training system.

### Release gates

**SHIP** is available only when all brief requirements are implemented, core truthfulness tests pass, silent-failure scenarios have been checked, required performance/memory evidence is present, the deployed route works, and known limitations do not invalidate the run-decision use case. Proposed performance targets may be revised only with a documented rationale and impact assessment, not by relabeling a missed target as a pass.

**DON'T SHIP** is required if a spike disappears in a containing viewport, invalid data becomes a finite value or an implied continuous line, duplicate handling hides a conflicting extreme, another run's response is displayed, displayed numbers disagree with source data, or required evidence is missing. The verdict identifies the first concrete change needed and its expected effect.

The local product implementation and assignment submission are separate completion questions. The core features and required measurement artifacts now exist. The [final note](submission/SUBMISSION.md) records a qualified **SHIP** verdict for the supplied scope, explains the hover target miss and separates agent-run checks from independent candidate review. This specification is not itself the submission note.

## 10. Delivery artifacts

| Artifact | Required content | Completion condition |
| --- | --- | --- |
| Repository | Source, deterministic fixtures or generation instructions, setup commands, test commands, and limitations | A fresh checkout installs, runs, and reproduces documented results. |
| Deployed link | Working monitor on Vercel or GitHub Pages | List and direct detail URLs load; the million-point case is usable on the deployed build. |
| Tests and output | Correctness/interaction tests, command output, and known coverage limits | Evidence refers to the reviewed source revision and dataset version. |
| Performance evidence | Before/after traces or screenshots, timing values, tab-memory measurements, and methodology | Another reviewer can reproduce the scenario and locate the stated timing boundaries. |
| Final note | No more than two rendered pages covering design decisions, correctness evidence, performance, silent failures, limitations, verdict, and first change | Rendered length is checked; links may point to larger supporting evidence. PRD/TRD length does not count as the final note. |
| Reflection | One paragraph describing what surprised the implementer and what still concerns them | Written from actual implementation and measurement experience, not fabricated in advance. |
| AI disclosure | Where AI was used, accepted suggestions, and what was independently verified, changed, or redone | Names actual work and verification; does not claim unperformed human review. |

The brief requests submission by email reply to `team@trysoup.dev`. Preparing artifacts and recording that requirement is in scope for planning; sending the email needs a separate explicit user instruction. The brief's 40-minute live discussion is an evaluation activity after submission, not content to script in these documents.

The user subsequently made the repository public and explicitly authorized merging into `main`, pushing and deploying on GitHub Pages. The deployed-link criterion is complete at [the live monitor](https://vlat247.github.io/soup-tz/), with the [successful workflow](https://github.com/vlat247/soup-tz/actions/runs/42782341803) and [hosted verification](../evidence/github-pages/verification.md) retained. Required performance/memory evidence remains separate. A [submission draft](submission/NOTE_DRAFT.md) contains implementation decisions, reflection and AI disclosure, with unmeasured evidence clearly marked pending.

## 11. Implementation sequence

The following is a proposed allocation within the assignment's 4-6-hour effort estimate. It is a planning constraint, not a guarantee that every requirement can be completed in that time.

| Stage | Indicative effort | Exit condition |
| --- | --- | --- |
| Foundation and fixtures | 30-45 minutes | Project runs; 20 reproducible fixtures and defect oracles exist. |
| Normalization and truthful chart core | 60-90 minutes | Invalid, gap, duplicate, spike, and numeric invariants pass direct tests. |
| List/detail and interaction | 60-90 minutes | Required pages, cards, controls, states, and keyboard paths work. |
| Failure checks and measurement | 60-90 minutes | Race/staleness/locale/log checks and before/after traces are retained. |
| Deployment and evidence note | 30-45 minutes | Hosted smoke check, complete evidence bundle, concise note, disclosure, and verdict. |

Capture the performance baseline before applying optimizations. If time runs short, remove optional presentation features and additional statistics before sacrificing truthfulness or evidence. If essential requirements remain unmet, retain the incomplete evidence and issue DON'T SHIP with a clear next change.

## 12. Requirement traceability

| Brief item | Product requirements | Evidence or deliverable |
| --- | --- | --- |
| Twenty runs and defective data | DATA-01 through DATA-07 | Fixture manifest, deterministic generator checks |
| Run list with sort/filter | LIST-01 through LIST-05 | Interaction tests and deployed list |
| Detail charts and summary cards | DETAIL-01 through DETAIL-06 | Detail-route tests, source-value assertions |
| Spike, NaN, duplicates, sorting, axes | CHART-01 through CHART-05; TEST-01 through TEST-04 | Unit/property/rendered tests and output |
| Loading, empty, error, responsive, keyboard, contrast | STATE-01, STATE-02, STATE-06; UX-01 through UX-05 | Interaction/accessibility checks and manual review |
| First render, zoom, hover, 4x CPU, tab memory, before/after | PERF-01 through PERF-05 | Traces, memory records, comparison table |
| Stale data and request races | STATE-03 through STATE-05 | Delayed-response and refresh scenarios |
| Locale/time zone, smoothing, log with zeros | UX-06; CHART-06; CHART-09 | Locale/time-zone test matrix and scale checks |
| Verdict and first change | Release gates | Final note |
| Repository, deployment, note, reflection, AI use | Delivery artifacts | Submission package |

The brief weights data truthfulness at 30%, silent failures at 20%, performance/UX/accessibility at 15%, and the live discussion at 35%. This prioritizes work but does not waive any required deliverable.

## 13. Open decisions and risks

- **Deadline origin:** The 48-hour window cannot be converted to a calendar deadline without its starting timestamp.
- **Reference hardware:** Performance targets become comparable only after the measurement device/browser and exact timing definitions are recorded.
- **Conflicting duplicates:** Ambiguity must remain visible. Verify that the renderer supports a broken line, an observed-range marker, an invalid indicator where needed, and inspection of the original values before committing to it.
- **Data gaps:** Gap detection depends on declared sample cadence; otherwise irregular sampling may be mislabeled as missing telemetry.
- **Dense anomaly intervals:** Reduced rendering must still communicate invalid/conflicting regions even when individual points are subpixel. Use an explicit aggregate indicator rather than silently omitting the evidence.
- **Log mode:** Linear-only is the smaller safe initial choice. If log mode is introduced, its nonpositive-value behavior and tests are release requirements.
- **Evidence scope:** Synthetic data can validate intended edge cases but cannot establish production readiness for unbounded, corrupted, or continuously arriving real telemetry.
