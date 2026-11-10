# Downsampling — 10 November 2026

Branch: `feature/downsampling`, based on pushed `feature/data-validation` checkpoint `a14e4c6`. Implementation commits: `578eddd` (exact buckets and source column queries), `986a46b` (singleton scan optimization and benchmark), and `f877330` (validated worker/session integration and HTML inspector).

## Result

The [integration check](check-final.stdout) passed **525 tests across 14 files**, ESLint, strict TypeScript, exact catalog consistency for 20 runs, and a production build at `f877330`. [Command/environment/exit metadata](check-final-command.json) and [stderr](check-final.stderr) are retained. Later copy corrections make single-observation and single-duplicate labels singular; the observation label was checked in the development browser, and the final component passed focused ESLint. These do not alter numerical or session behavior. Other subsequent changes are documentation/evidence only.

The [independent source audit](source-validation.json) passed all **60 cases** (20 fixtures and seeds 1–40): 1,086,106 fixture rows, 300 viewports, 900 metric results, 130 fragmented metric frames and 3,891 exact inspection groups/pages. [Invocation metadata](source-validation-command.json) records exit zero. All 20 [fixture fingerprints](fixture-preservation.json) match the preceding data-validation report. Source recipes, broken telemetry and catalog facts are unchanged.

## Correctness and inspection

| Area | Change | Evidence |
| --- | --- | --- |
| Exact bucket boundaries | Correct floating projection against integer thresholds derived by quotient/remainder arithmetic. Reduction and column inspection use the same canonical geometry. | [Boundary reproduction](bucket-boundary-review.json), [initial regression failure](bucket-regression-initial.txt), [focused reducer pass](reducer-final-01.txt) |
| Independent oracle | Use BigInt rational division for expected source membership instead of repeating the production floating expression. | [Previously missed audit failure](exact-oracle-initial.txt), final 60-case audit |
| Source column queries | Return original minimum/maximum with step and source index, finite/invalid/missing counts, conflict steps, duplicate rows and intersecting gaps. Ties use earliest step then original index. Empty columns stay empty. | [24 column tests](column-inspection-final.txt), including MAX_SAFE_INTEGER boundaries, integer-empty columns, signed zero, conflicts and gaps |
| Worker/session | Query the committed viewport; validate bounded column identities, counts and extrema. Zoom/resize clears old column context; obsolete replies cannot restore it. | [67 focused integration tests](column-integration-02.txt), final 525-test suite |
| Scan cost | Single-row groups classify their reading once and fill reusable statistics directly. Duplicate groups retain the comparison loop. | [14 preservation tests](group-scan-before.txt) passed before optimization; [157-test focused pass](group-scan-after.txt) after it |

The boundary defect is concrete: JavaScript evaluates `Math.floor(45 / 66 * 22)` as 14, while exact rational membership is column 15. In the reproduced source, loss at steps 43/44/45 is 10/5/6. The old reducer incorrectly combines step 45 with the previous column and omits required endpoint `(44, 5)`. The prior audit repeated the same floating formula and missed it. Production now avoids BigInt in the row loop; independent tests use it as the oracle.

Column checks include 600 compatible queries over 40 adversarial sources and mutation checks for identity, range, accounting, invalid extrema and missing fields. Runtime reply guards are consistency checks, not a proof of every source value. Queries still scan original groups in the selected column; response size is constant, but work is proportional to the rows in that column.

## Production browser observations

The local production build at `f877330` ran on port 3001, with CUA-controlled Chromium in the in-app browser. These are targeted observed interactions, not an automated browser suite. Desktop viewport was 1280 pixels wide; mobile override was 360 × 800. The temporary production server/tab were stopped after QA; the development demo remains on port 3000.

| Check | Observed result | Saved evidence |
| --- | --- | --- |
| Million-point spike | Selecting step 500,001 shows exact loss 0.2478; its 2,618-row column includes original maximum 12 at step 500,000. | [Column state](browser-spike.txt), [screenshot](million-column.jpg) |
| Keyboard extremum action | Enter on the loss maximum button selects step 500,000 and exact loss 12. Visible focus is present. | [Selection state](browser-peak-click.txt), screenshot above |
| Zoom | Range 501,000–502,000 removes previous column facts. Re-inspecting 501,500 gives a 3-row column and local maximum about 0.2656; chart visible max is about 0.2691. Whole-run cards retain their values. | [Cleared state](browser-zoom-cleared.txt), [fresh query](browser-zoom-column.txt) |
| Finite conflict | At run-012 step 700, exact loss remains conflicting; column statistics include maximum 12 and one conflicting step. | [Conflict state](browser-conflict.txt) |
| Invalid conflict | At run-012 step 1,700, the column has 11 finite and 1 invalid loss readings, with 1 conflicting step. Other metrics remain independent. | [Invalid column state](browser-invalid-column.txt) |
| Gap on mobile | At run-014, range 590–630, requested step 610 selects nearest recorded step 620 while the requested column shows 0 observations, 1 missing interval and no extrema. All three charts visibly break across the gap. | [Gap state](browser-mobile-gap.txt), [mobile screenshot](mobile-gap-column.jpg) |
| Local scrolling | Mobile page width equals viewport width, 360px. Column table scrolls within a 328px region containing 663px of content. | [DOM dimensions](mobile-layout.json) |
| Outside visible range | Exact inspection of step 700 still works when range is 590–630; column disclosure is absent. | [Outside-range state](browser-outside-range.txt) |
| Console | No warnings or errors captured during these production checks. | [Console log](browser-console.json) |

After production QA, the single-observation label was corrected and observed as `1 observation` on the development build at 360px ([state](browser-copy-followup.txt), [focused lint](copy-followup-lint.txt)). The saved production screenshots show plural counts and remain representative.

Column membership follows the shared reduction budget, which uses the narrowest chart; it does not promise one physical pixel on the wider loss chart. Zoom/resize invalidates column context; it returns on the next inspection. Extremum actions navigate to the original step. For a duplicate group larger than 20 rows, its named source row may require subsequent source pagination. No full keyboard-only journey or assistive-technology session was performed here.

## Node engine measurement

`npm run bench:reduction` times synchronous `buildFrame` only. Generation, preparation, hashing, worker messaging, chart rendering and input-to-paint are excluded. Environment: Node v24.13.1, macOS arm64, Apple M2, 8 logical CPUs. UTC timestamps are November 9; local Asia/Almaty date is November 10.

Each reduced case has 3 warmups and 12 retained samples. All reduced cases run before single raw-mode observations. No CPU throttle or forced GC was used, and the machine was not reserved or verified idle. The reported nearest-rank p95 is the maximum of 12 samples. Raw timings are single observations, not robust percentiles.

The [initial baseline](engine-before.json) predates the exact-bucket fix and is retained for context. To isolate the scan optimization, the old `scanGroup` implementation from `a14e4c6` was temporarily substituted into the **same current exact-bucket reducer**, benchmarked, then restored byte-for-byte and measured again. Reports record source fingerprints, code hashes, sample order, timings and returned facts. The [comparison](engine-isolated-comparison.json) verifies restoration and unchanged output facts; [before](engine-isolated-before.json) / [after](engine-isolated-after.json), corresponding `.command.json` files and saved `.scanGroup.txt` variants allow review.

| Case | Median before → after | p95 before → after |
| --- | --- | --- |
| Million rows, width 320 | 234.0 → 172.4 ms | 279.8 → 196.2 ms |
| Million rows, width 1024 | 228.6 → 164.8 ms | 232.3 → 166.0 ms |
| 2,001-row zoom, width 320 | 0.645 → 0.529 ms | 0.831 → 0.744 ms |
| 2,001-row zoom, width 1024 | 0.912 → 0.749 ms | 2.977 → 0.980 ms |
| Fragmented 60,000 rows, width 320 | 14.08 → 10.16 ms | **14.78 → 17.82 ms** |
| Fragmented 60,000 rows, width 1024 | 14.20 → 10.50 ms | 14.58 → 10.99 ms |

The isolated full-million median improves about 26–28%; the fragmented width-320 tail regresses and is retained. This comparison supports keeping the simpler singleton fast path. It is not a measured browser improvement or the net improvement over the old branch, because the bucket correctness fix also changes scan cost.

Across all three metrics, the million-row full view returns 3,196 drawing entries at width 320 and 10,221 at width 1024, versus 3,000,000 raw entries. The original spike remains 12 at step 500,000. These counts do not imply that every local peak survives reduction.

## Remaining acceptance

No raw browser baseline, matched 4× CPU traces, tab-memory measurements, browser fault-injection matrix, full accessibility/locale checks or deployment were completed. This work closes the source column inspection gap and fixes a demonstrated reduction defect; it does not establish the PRD's performance budgets or a SHIP verdict. Earlier broader chart observations remain in the [charts checkpoint](../charts/verification.md).

AI assistance produced the implementation, tests, review and these notes. Recorded automated checks and browser observations were performed by the agent; no claim is made that the user independently verified them.
