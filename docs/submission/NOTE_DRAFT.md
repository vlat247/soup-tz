# Soup training monitor — submission note draft

**Working draft.** Final branch validation passed; required browser performance measurements remain pending. The user will deploy later. This file is not the completed submission; verify a maximum of two rendered pages when finalizing it.

Repository: https://github.com/vlat247/soup-tz (private; reviewer access must be arranged). Branch: `pref/optimization`. Deployed application: user-owned later step. Tested code revision: `d8192b0`.

## What the monitor does

Twenty deterministic training runs exercise normal convergence, divergence, malformed readings, missing observations, duplicated and unsorted steps, and a million-point run with loss **12 at step 500,000**. The searchable run list supports both loss-sort directions with unavailable values last and distinct empty/no-match states. It opens separate linear charts for loss, learning rate and gradient norm. Shared range controls, source inspection, quality details and exact summaries distinguish training behavior from telemetry problems.

The worker preserves full-resolution observations. Duplicate groups are resolved independently per metric: identical readings collapse; conflicting readings remain visible as conflicts, with their finite extrema available for inspection. NaN, infinity, missing readings and known-cadence gaps break the affected line. Invalid readings never become zero. Rejected steps remain inspectable and are excluded from plotted domains.

Each continuous segment is reduced independently per metric using first/minimum/maximum/last observations in visible buckets. Original steps, values and order survive; zoom and resize recompute from source. ECharts uses Canvas, linear axes, no smoothing and no built-in lossy sampling. Exact cards and axis bounds come from raw observations, including finite conflict extrema. This preserves bucket extrema and the required isolated spike; it does **not** claim every local peak survives compression.

## Evidence and remaining limits

The previous committed checkpoint, `1aaeeca`, passed **585 tests in 17 files**, lint, strict types, catalog consistency and a production build. Its independent source audit passed 60 cases, 300 viewports, 900 metric results and 3,891 inspection groups/pages; all 20 source fingerprints were unchanged. These are historical results, not a substitute for the final branch check. See [retained output and verification](../../evidence/silent-failers/verification.md).

Final `npm run check` at `d8192b0`: **597 tests in 19 files passed**, plus lint, strict types, all 20 exact catalog summaries and a production build. [Current evidence and retained output](../../evidence/optimization/verification.md) distinguish the new checks from the unchanged source/presentation audit. Unsuccessful attempts remain beside successful reruns.

The historical browser record covers stale refresh disclosure, late run/range/inspection replies, malformed replies, timeout, keyboard retry, renderer failure/retry and zero-size recovery. Current targeted checks add both loss-sort directions, Enter-to-reset search focus, exact spike/next-step inspection, a three-step range, All steps reset and a 360px layout with three canvases and drawer Enter/Escape focus recovery. Deployed smoke checks belong to the user's later deployment. Nine locale/time-zone cases are **Node** checks. Numerical/fake-renderer tests and these observations do not establish every painted pixel, device, browser sequence or screen-reader interaction.

## Before/after performance

The opt-in `/benchmark` harness compares main-thread raw rendering with worker/reduced rendering of the same `run-020` source and Canvas adapter. Ordinary production builds return 404 for this route. Use a production build, matched viewport/browser and **4× CPU throttling**; save Performance traces and separate browser tab-memory observations. Scripted inspection timings exclude pointer input, and the double-animation-frame endpoint is a paint proxy. Neither establishes actual hover response or verified paint.

| Measurement | Raw baseline | Reduced version |
| --- | --- | --- |
| First useful chart | Pending trace | Pending trace |
| Zoom response | Pending trace | Pending trace |
| Hover response | Pending trace | Pending trace |
| Tab memory: absolute and increase over baseline | Pending browser measurement | Pending browser measurement |

Record browser/OS/hardware, revision, fixture version, viewport/DPR, cache state, sample count and memory method alongside results. Distinguish tab footprint from JavaScript heap, and disclose any failed or unresponsive baseline. Earlier Node reduction timings exclude generation, worker messaging and painting; they are not browser performance evidence.

## Verdict and first change

**Current draft: DON'T SHIP as a completed assignment.** Core product behavior is implemented and the final check passed, but required browser timing/memory evidence is not attached. The user retained deployment for later. Reassess from final evidence. The first action is to record the missing measurements; select any further performance change from the measured bottleneck rather than inventing an improvement claim.

## Implementation reflection

An instructive failure was an integer bucket boundary lost through rounded floating-point arithmetic: a reducer and an oracle sharing the same formula can agree while both are wrong. Exact quotient/remainder boundaries and independent BigInt checks made the tests more meaningful. The remaining concern is the boundary between numerical correctness and what a researcher actually sees: asynchronous state, renderer recovery, readable labels and measured responsiveness need browser evidence of their own. This paragraph describes the recorded implementation experience; it does not claim a personal observation or independent review by the candidate.

## AI use

Codex assisted with planning, documentation, fixtures, implementation, tests, diagnostic tools, evidence collection and this note. Accepted directions include worker-owned source data, per-metric extrema-preserving reduction and explicit invalid/gap states. The initial latest-duplicate-wins idea was refined into per-metric conflict reporting; the chart design retained separate metric plots, and the user directed the black/cream/orange palette and supplied icon. Verification was performed by the agent through automated checks and the browser observations named in the evidence. No independent human review is claimed; any candidate review must be added only after it occurs.
