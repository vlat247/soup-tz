# Silent failures — 10 November 2026

Branch: `fix/silent-failers`, using the user's requested spelling, based on pushed downsampling checkpoint `88812e8`. Tested implementation: `1aaeeca`, comprising `fcdf15d` (session deadlines), `dc58b68` (presentation/export helpers and environment matrix), `8ae8dc1` (renderer recovery), and `1aaeeca` (dashboard integration and diagnostic controls). Subsequent changes are documentation/evidence only.

## Result

`npm run check` passed **585 tests across 17 files**, ESLint, strict TypeScript, exact catalog consistency for all 20 runs, and a production build. [Output](check-final.stdout), [stderr](check-final.stderr) and [command/environment/exit metadata](check-final-command.json) are retained.

The [source audit](source-validation.json) passes all **60 cases**, covering 300 viewports, 900 metric results, 130 fragmented metric frames and 3,891 exact inspection groups/pages. All 20 [fixture fingerprints](fixture-preservation.json) match the preceding checkpoint. No generated source bytes, reduction rules or dataset versions changed. [Command metadata](source-validation-command.json) records successful execution.

The separate [presentation matrix](presentation-final.json) passes **9/9 Node environments**; [invocation metadata](presentation-final-command.json) records the command and revision. Environment: Node v24.13.1, macOS arm64. UTC timestamps are November 9; the local Asia/Almaty date is November 10.

## Fixes and retained reproductions

| Problem | Change | Evidence |
| --- | --- | --- |
| Worker never replies | Each sent load, viewport or inspection request has a 30-second deadline. Expiry stops the session, shows a recoverable error and preserves complete previous content and retrieval time. Retry remains manual. | [Initial 13 failures](session-initial.txt), [58 passing session tests](session-final-02.txt) |
| Chart renderer throws | A small controller catches creation, draw, resize, clearing and coordinate failures. It removes stale pixels and pointer/guide state, then offers a local Retry chart action using the latest desired frame. | [Three old-component failures](renderer-initial.txt), [reproduction source](renderer-before.test.tsx.txt), [57 passing renderer/model tests](renderer-final-01.txt) |
| Zero-sized chart | Defer renderer creation at zero size; release an existing surface while hidden and recreate it with the latest frame after space returns. Successful retry also reports the measured plot width. | 18 new controller tests and browser hide/show observation |
| Finite label reads as infinity | `formatValue(Number.MAX_VALUE)` previously returned `1.80e+308`, which parses as Infinity. Fall back to its full finite representation if rounded scientific notation overflows. | [Three initial formatting failures](format-initial.txt), [69 passing format/run-view tests](format-focused.txt) |
| Exact text loses signed zero | `formatExactValue` preserves `-0` in source cells and inspector/column descriptions. Ordinary approximate zero labels remain `0`. | New format tests and actual dashboard wiring |
| Export silently coerces unexpected nonfinite numbers | The existing tagged summary format already preserves invalid classes. The extracted serializer now rejects an unexpected untagged nonfinite number instead of JSON converting it to null. Export exceptions become a visible bounded error. | New export tests plus downloaded production summary |

The new timeout policy is an engineering decision, not a deadline specified in the assignment. Deadlines start when a request is sent, not while it waits in a coalescing queue. Success, cancellation and abandoned inspection clear their timers. A superseding queued request cannot renew a stuck in-flight request. Unknown or wrong-run envelopes are still ignored for stale-result safety; they cannot keep a pending request alive indefinitely. Browser suspension or a blocked event loop can delay timer execution, so 30 seconds is a configured deadline rather than a guaranteed wall-clock response time.

The renderer remains synchronous and uses the existing ECharts Canvas implementation and linear numerical model. It publishes a pointer model only after the corresponding draw succeeds. Other metric panels and source inspection remain usable after one panel fails. Controller tests use a fake renderer; browser observations below also exercise the real Canvas adapter.

## Reproducible browser scenarios

Run `npm run dev`, then open `/diagnostics/silent-failures`. The development-only page embeds the real `RunDashboard`, `useRun` session and Web Worker. Its transport wrapper holds selected real replies, injects a bounded error/malformed envelope or drops a load request. It never edits fixture values. A stable renderer wrapper can fail the next loss draw once. The harness uses a documented **10-second** request deadline to make waiting scenarios practical.

The page contains replay instructions and a bounded event log. Held replies retain their original receiver after termination, modeling an event already queued during cancellation. Four transport tests verify receiver identity, one-shot fault selection, failed/dropped requests and queue/log bounds ([output](transport-final.txt)). No diagnostics query parameter or control is added to normal run routes.

These are targeted CUA-driven observations in the in-app Chromium browser at a 1280px desktop viewport. The run switch changes the actual dashboard's `runId` through diagnostic buttons; it is not a full Next.js router-navigation race suite.

| Scenario | Observed result | Evidence |
| --- | --- | --- |
| Failed refresh | Old charts/cards remain with an explicit failure and previous-snapshot notice. Source timestamp and last successful load are byte-identical before/after failure. | [State](browser-refresh-failed.txt), [timestamp comparison](browser-freshness.json) |
| Keyboard retry | Enter on Try again restores ready state. Source time stays fixed and the successful retrieval time advances. | [Recovered state](browser-refresh-retry.txt) |
| Late run A after B | Hold A's load, select B, then release A. B's heading, 4,999 latest step, summaries and three chart descriptions remain associated with B. | [Late-run state](browser-late-run.txt) |
| Superseded range | Hold Last 25%, request Last 10%, then release. All three charts commit range 4,499–4,999 with 501 observations. | [Range state](browser-late-range.txt) |
| Superseded inspection | Hold step 100, request 200, then release. Exact inspection commits step 200. | [Inspection state](browser-late-inspection.txt) |
| Malformed current range | Unexpected response type shows a visible error, retains the previous complete frame, and provides Try again. | [Malformed-reply state](browser-malformed-range.txt) |
| No response | A dropped refresh first shows pending/previous content, then a visible processing timeout. Manual retry succeeds. | [Pending state](browser-stalled-pending.txt), [Timeout state](browser-timeout.txt) |
| Loss draw throws | Loss shows Chart unavailable and Retry chart; its canvas is removed/hidden while the other two canvases remain visible. | [Failure state](browser-render-failed.txt), [screenshot](chart-recovery.jpg) |
| Chart retry | Enter on Retry chart restores the loss plot; all three canvases are present and the error disappears. | [Retry state](browser-render-retry.txt) |
| Zero-size recovery | Hide dashboard removes all three canvases; Show dashboard restores three with the current range. | [Restored state](browser-size-restored.txt) |

The development [console record](browser-development-console.json) contains no errors or warnings during these scenarios. One CUA lookup initially matched both the application alert and Next's route announcer; narrowing the locator to the application's alert resolved the test interaction. It was not an application failure.

## Production smoke checks

The production build at `1aaeeca` ran locally on port 3001. Both diagnostic routes returned **HTTP 404** with no diagnostic controls ([HTTP results](production-routes.json)). The temporary production server and QA tabs were stopped after checks; the development server on port 3000 remains available.

- `run-019` shows NaN and no finite loss rather than a zero chart; the other metrics remain plotted ([state](production-invalid.txt)). The actual **Export summary** download retains `{ "kind": "nan", "value": null }`, a null loss extent and 3,000 invalid loss readings ([downloaded JSON](production-export.json)). The null is part of the tagged invalid representation, not a finite zero.
- `run-020` retains the visible isolated peak and exact value **12 at step 500,000** ([state](production-million.txt), [screenshot](production-million.jpg)).
- At **360 × 800**, all three charts remain visible and page width equals viewport width, 360px ([DOM observation](production-mobile.json)). This is a targeted responsive check, not a complete device/DPR matrix.
- The production [console record](browser-production-console.json) contains no warnings or errors.

## Presentation environment matrix

Run `npm run validate:presentation`. The script starts nine fresh Node subprocesses: `en-US`, `de-DE`, `fr-FR` × `UTC`, `Asia/Almaty`, `America/Los_Angeles`. Each subprocess verifies its actual resolved default locale/time zone and winter/summer offsets before checking application output against fixed expectations. A failure is retained and makes the command exit nonzero.

The checks cover explicit en-US numbers, UTC date-boundary/DST instants, tiny and maximum finite labels, signed zero in exact text, invalid-reading labels, source dimensions, linear axes, no smoothing, no gap bridging and no built-in lossy sampling. Application labels intentionally remain fixed despite different environment defaults. The matrix does **not** claim browser locale overrides, cross-environment hydration, painted Canvas truth or numeric-sort UI interaction.

## Remaining scope

Targeted browser failure scenarios now exist, but complete router races, automated browser scheduling/Canvas assertions, the browser locale/time-zone matrix, full keyboard-only recovery, screen-reader and contrast checks remain incomplete. Required 4× CPU before/after traces, a raw browser baseline, tab-memory measurements, deployment and submission artifacts remain open. The [PRD audit](../../docs/PRD_AUDIT.md) retains those gates; this branch does not establish a SHIP verdict.

AI assistance produced the implementation, tests, diagnostic controls and this record. The automated checks and browser observations were performed by the agent; no claim is made that the user independently verified them.
