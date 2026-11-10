# Browser comparison harness

The `/benchmark` route supplies a controlled comparison, not completed performance evidence. Development smoke checks are retained separately. No 4× CPU trace, cold-load series, physical hover latency or tab-memory result is established by the harness or its unit tests.

## Running a production comparison

Use Node 24.x and build the opt-in route:

```sh
NEXT_PUBLIC_ENABLE_BENCHMARK=1 npm run build
npm run start
```

Open `/benchmark?variant=raw` and `/benchmark?variant=optimized` in separate fresh navigations. Without the flag, production builds return 404 for `/benchmark`. Development also exposes the route, but development timings cannot serve as the required production comparison.

Both variants use deterministic `run-020` (seed 1020, 1,000,000 source rows), the same numerical helpers, chart options and ECharts Canvas adapter. Raw mode generates, prepares and builds all visible finite source observations on the main thread; the full initial frame contains 3,000,000 metric entries. Optimized mode uses the production worker/session and per-metric reduction. Both preserve the exact loss peak of 12 at step 500,000. The shared reduction width is computed from the narrowest actual drawable chart area; viewport, chart sizes and DPR are included in the report. Keep the browser geometry fixed during each series.

1. Configure and independently verify 4× CPU throttling in Chrome DevTools. Record browser/OS/hardware versions, cache settings, source revision and worker-throttling attribution. The page does not attest those settings.
2. Capture a Performance recording with screenshots and User Timing marks. Select **Load million-point run**, then **Run 30 zooms + 30 inspections**. The fixed zoom sequence contains the isolated spike, including on either viewport edge. Every action waits for its own completion; obsolete callbacks cannot complete a later sample.
3. Export the measurements, or read the bounded JSON inside **Measurement report and limits** (`data-testid="benchmark-report"`). Export before reloading. A report retains at most 200 attempted samples, including failures. The variant locks after the first attempt, including a failure, to prevent mixed aggregates. Unload does not erase the ledger.
4. For cold loads, use `/benchmark?variant=raw&autorun=1` and `/benchmark?variant=optimized&autorun=1` with five independent cache-controlled navigations per variant. `navigationToPaintProxyMs` starts at navigation time zero; ordinary `durationMs` starts at the scripted load command. FCP is a separate field. Preserve each navigation's report before the next reload.
5. In a separate memory pass, retain Chrome Task Manager footprint and JS-memory observations for the empty page, loaded steady state after a documented idle period, observed peak and after **Unload run**. Three empty chart containers remain mounted before load and after unload. Unload disposes renderers, terminates the worker, releases source/frame references, clears source inspection and removes renderer-added accessibility labels. Note process/worker attribution and GC uncertainty; the page does not claim that reference release immediately reduces OS memory.

## Interpretation and limits

User Timing records command input, source readiness, draw submission and a second `requestAnimationFrame` endpoint. This endpoint is a paint proxy: correlate it with actual trace frames/screenshots before claiming painted latency. Scripted inspection timings exclude physical pointer/key dispatch and the dashboard's real hover event path. They do not close the assignment's hover-response requirement. The UI displays exact inspection results so correctness can be checked separately.

Successful medians and nearest-rank p95 exclude failed attempts; attempted, passed and failed counts remain visible. A 120-second watchdog records a failure when it can run, but cannot preempt a blocked main thread, guarantee execution in a background tab or recover a browser out-of-memory crash. Preserve crash/timeout evidence rather than substituting a smaller raw baseline. The harness does not resize itself into a new experiment while recording; reload at a stable viewport if geometry changes.

## Focused verification

`benchmark-checks.json` records commands, timestamps and exit codes with separate stdout/stderr. Final focused results: 4 protocol tests passed; benchmark ESLint and TypeScript checks passed. Tests cover obsolete completion identity, retained failed samples, a bounded ledger, separate navigation timing, percentile accounting and repeatable spike/edge workloads. The earlier `benchmark-lint.txt` preserves an unused-suppression warning that was subsequently removed; it is not a passing lint result.

The original assignment still requires actual production before/after 4× CPU traces for first render, zoom and hover, plus browser tab-memory measurements. These are explicitly unclaimed here. Five cold navigations per variant and the 30-command sequences are the project's repeatability protocol, not additional sample counts prescribed by the assignment.
