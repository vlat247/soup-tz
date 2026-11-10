# Production browser evidence - 10 November 2026

Measured source: `0eb0e3d` (production build with `NEXT_PUBLIC_ENABLE_BENCHMARK=1`, no Pages flag). The ordinary deployed product still disables `/benchmark`. This is a controlled raw/main-thread versus worker/reduced comparison using the production numerical helpers and ECharts Canvas adapter, not a historical checkout or a live-network benchmark of GitHub Pages.

## Results

All times below are derived from retained Chrome **Paint** events, not just `requestAnimationFrame` durations. The event ledger and its conservative paint proxies remain in the original JSON exports.

| Measurement | Raw / main thread | Worker / reduced |
| --- | ---: | ---: |
| Cold first complete chart, median (5 navigations) | 13,630 ms | 864 ms |
| Cold first chart, range | 8,906-14,874 ms | 748-1,215 ms |
| FCP median (same 5 navigations; not chart readiness) | 124 ms | 132 ms |
| Zoom median / p95 (30 commands) | 34.7 / 909.2 ms | 30.7 / 84.0 ms |
| Real mouse-movement inspection median / p95 (30 accepted events) | 29.9 / 100.6 ms | 21.2 / 55.8 ms |
| Scripted inspection median / p95 (30 commands; separate from hover) | 17.3 / 18.0 ms | 16.9 / 17.9 ms |
| Zoom maximum | 1,264.5 ms | 170.8 ms |
| Mouse-movement inspection maximum | 306.9 ms | 70.5 ms |
| Empty tab footprint (Chrome display units) | 48.3 MB | 44.5 MB |
| Loaded footprint after at least 30 seconds idle | 1.4 GB | 103 MB |
| Increment over own empty baseline, approximate | 1.35 GB | 58.5 MB |
| Largest sampled footprint during load / loaded pass | 1.4 GB | 109 MB |
| JS memory, loaded: allocated (live), Chrome K units | 981,856K (941,606K) | 8,448K (7,116K) |

These are small-sample observations on one active development laptop, not universal promises. In particular, median zoom hardly changes: small ranges were already inexpensive. The main gain is the costly zoom tail and initial raw drawing. FCP does not improve and is retained. Optimized hover **misses** the proposed 50 ms p95 target by 5.8 ms; zoom p95, first-chart median and incremental memory meet the project's other proposed budgets. Those budgets were chosen by this project, not prescribed by the assignment.

## Environment and matching

- MacBook Air (Mac14,2), Apple M2, 8 CPU cores (4 performance + 4 efficiency), 8 GB RAM; macOS 26.5 (25F71). Node 24.13.1, npm 11.10.0, Next 16.4.5, ECharts 6.1.0.
- The **running browser's reported user agent** is Chrome/154.0.0.0, recorded in every report. The installed app bundle reports 157.0.8103.39; that is not substituted for the running browser's version. UA's Intel/Mac OS 10_15_7 tokens are compatibility strings, not this machine's CPU/OS.
- Chrome Incognito; local HTTP production server on `127.0.0.1:3001`; no network throttling; cache disabled while DevTools is open. Timing captures include screenshots and sampling. All four original trace exports independently contain `metadata.cpuThrottling: 4` and `hostDPR: 2`. The setting is also retained in `throttling-settings.png`.
- CPU slowdown is a DevTools simulation, not a machine-wide 4x clock reduction. Worker threads are present in the optimized trace, but a fourfold slowdown of each worker was not independently calibrated. Do not interpret these results as a specific slow device. [Chrome's profiling guide](https://developer.chrome.com/docs/devtools/performance) describes the recording workflow; Chromium's [emulation implementation](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc) routes the page setting to its thread throttler.
- Same deterministic `run-020`, seed 1020, source version `soup-fixtures-v1`, generator 1.0.0, 1,000,000 rows, loss 12 at step 500,000. Raw mode renders 3,000,000 metric entries. Optimized mode renders 3,266 entries at the initial interaction-test width. Both retain the source peak at every scripted viewport, including either boundary.
- Interaction pair: **915 x 837 CSS px, DPR 2**; loss canvas 849 x 260, two other canvases 416 x 220; initial shared reduction width 328, 327 in the final narrow range. Exact geometry is in each report.
- Cold-load series: **727 x 837 CSS px, DPR 2**, five cache-disabled navigations for each variant, width 234. The DevTools divider changed between experiments; these matched cold-load series are reported separately from the 915px interaction loads. No pooling across geometries. Cold here means network-cache disabled, not a new browser process, empty OS caches or uncompiled browser engine for every observation.
- Memory: fresh incognito window / renderer process for each variant, DevTools closed, no artificial CPU slowdown, normal full window (1470 x 837 CSS px, DPR 2; reduction width 510). The browser remained running between passes. No forced GC. Each baseline/steady reading followed at least 30 seconds idle; timestamps are in the observation files. Host was on AC when checked after capture; Energy Saver and unrelated host activity were not controlled.

## What the timings mean

`raw-4x.trace.json.gz` and `optimized-4x.trace.json.gz` retain the initial load, 30 fixed zooms, 30 scripted inspections, and 30 accepted real pointer events per variant. The two `*-cold-series-4x.trace.json.gz` files retain all five repeated navigations. Native Chrome DevTools performed recording/export; no fabricated trace events were inserted.

`python3 scripts/analyze-browser-evidence.py` joins each report to a unique trace navigation using the load completion mark, then checks each sample's identity, renderer PID/thread and frame. Each reported endpoint must be a Paint in that frame after its draw/DOM-commit mark and completed before its own completion marker. For load/zoom, the last such Paint is used conservatively so that a canvas paint preceding React's row/range facts is not mistaken for the complete update. For inspection, `useLayoutEffect` marks the actual inspector DOM commit, so the first subsequent Paint is used. CSV retains first-paint bounds, chosen bounds, all identities and proxy durations. The correlation covers **192 completed samples**. It is not photon-to-screen or hardware input-device latency.

The visible first chart is the loss plot, with correct axes, source count and spike. Other canvases are submitted by the same operation but below the fold; no claim is made that all three are simultaneously visible. Unmodified filmstrip frames show the initial visible result. Earlier canvas-only frames are retained as well and may still show the pre-commit benchmark counters.

The zoom workload repeats six ranges five times: 450000-550000, 490000-510000, 499900-500100, 500000-500020, 499980-500000, 499000-501000. It is scripted input, not a physical wheel gesture. Discrete pointer moves use the browser's trusted DOM `mousemove` timestamp, include event queue delay, one animation-frame scheduling step, Canvas coordinate decoding, raw/worker source inspection and React text commit. Native computer control generated short mouse drags over the chart; the button was held during movement, but no drag-zoom behavior exists in this shell. This exercises the mouse-move inspection path; it is not a measured human hand movement or a continuous-sweep stress test. There were 23 raw and 27 optimized busy pointer events ignored by the measurement shell, disclosed in the reports. The 30 accepted samples are all retained, with no outlier deletion.

This benchmark has a simpler inspector and different event wiring from the full dashboard, while sharing production mapping, source lookup, worker/session, reduction and renderer. Absolute live-dashboard interaction timing is not claimed. Diagnostic JSON serialization and React status updates add observer overhead. The two slowest optimized pointer samples spend about 30-34 ms queued before the handler. First follow-up: keep diagnostic report serialization outside the pointer hot path, then profile/coalesce inspector updates in the dashboard and repeat the 50 ms target check. Do not trade source accuracy for those few milliseconds.

## Actual memory, attribution and release

Task Manager screenshots and AX text are `*-memory-*.png/.txt`. Raw uses renderer PID 24360; optimized uses PID 24693. The optimized **Dedicated Worker** appears in the same Task Manager group/PID as the tab. Its footprint is included once; worker and tab must not be double-counted. Browser-wide and shared GPU processes are excluded because Task Manager cannot allocate them uniquely to this tab. Thus these are actual tab-renderer footprints, not whole-Chrome system memory or invented typed-array totals. JS memory is a separate column and does not include every backing allocation.

Values preserve Chrome's rounded MB/GB/K display units; derived differences are approximate. Peak means the largest sampled observation, not a continuously sampled high-water mark. Raw loaded JavaScript memory fell from 1,177,472K (1,121,180K live) at the early observation to the steady figure above. Its OS footprint still read 1.4 GB after 30 seconds unloaded, and its JS live memory remained 941,706K; no forced GC was used. One observation of delayed reclamation does not prove a leak. The optimized post-unload observation was interrupted by the Mac locking; the empty and loaded measurements above were saved before that interruption.

## Retained irregularities and limits

The first raw interaction trace contains an earlier load interrupted by a second reload before its completion marker. Its three marks remain in the trace. It is an abandoned setup navigation, not a passing load; the recorded ledger is paired only with the later completed navigation. The matched five-navigation series supplies the cold-load headline. `raw-pointer-pilot.json` is a partial export of that same ledger after the first pointer move, not another independent trial.

The first offline parser run used a 0.01 ms mark/ledger matching tolerance and rejected a 0.1 ms difference between two clock reads. The parser now allows at most 1 ms, still requires a unique navigation and bounds Paint by that sample's completion. No browser measurements were edited to fit it. No sampled load, zoom or accepted inspection failed; maxima, FCP non-improvement, the hover budget miss and raw delayed memory release remain reported.

These checks do not prove every device, viewport, browser race, screen-reader journey, real ingestion contract or local peak. CPU-throttling coverage, probe overhead, discrete pointer input, cache/process reuse, rounded memory and sampling limitations prevent precise extrapolation to other machines.

## Validation and delivery

`NEXT_PUBLIC_ENABLE_BENCHMARK=1 npm run check` passed **598 tests in 19 files**, lint, strict TypeScript, all 20 exact catalog summaries and production build at the measured source revision. Complete output: `check.stdout`, `check.stderr`. The extra test verifies native input-clock accounting and invalid timestamp rejection. Original numerical/source data is unchanged. Earlier failed results, independent raw-source audit, nine Node locale/time-zone cases, targeted keyboard/fault checks and hosted smoke remain in their historical evidence folders.

`comparison.json`, `trace-observations.csv`, `analysis.stdout`, `analysis.stderr` and `SHA256SUMS` are reproducible derived evidence. The four compressed traces and original JSON exports remain unchanged. Open `.trace.json.gz` directly in Chrome Performance using Load trace. The [two-page note](../../output/pdf/soup-submission-note.pdf) and [Markdown source](../../docs/submission/SUBMISSION.md) provide the verdict, reflection and AI disclosure.
