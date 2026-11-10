# Data validation — 10 November 2026

Branch: `feature/data-validation`, based on pushed charts checkpoint `3d251c2`. Tested implementation: `239bd67`, comprising source contracts (`25d72c4`), independent audit/reporting (`7095adb`) and worker reply validation (`239bd67`). Later changes are documentation and evidence only.

## Result

`npm run check` passed: **448 tests across 10 files**, ESLint, strict TypeScript, exact catalog consistency for 20 runs, and a production build. [Command/environment/exit metadata](check-final.json), [stdout](check-final.stdout) and [stderr](check-final.stderr) are retained. Environment: Node v24.13.1, macOS arm64. Recorded UTC timestamps fall on November 9; the local Asia/Almaty date was November 10.

The [full audit report](source-validation.json) passed all **60 cases**: 20 fixtures and adversarial seeds 1–40. It checked 1,086,106 fixture rows, 300 viewports, 900 metric results, 130 fragmented metric frames and 3,891 exact inspection groups/pages. [Invocation metadata](source-validation-command.json) records exit status zero. All 20 [source fingerprints](fixture-preservation.json) match the prior charts report, and catalog generation agrees with the committed catalog. Deliberate telemetry defects, fixture recipes and numerical reduction semantics are unchanged.

## Changes and evidence

| Area | Change | Regression evidence |
| --- | --- | --- |
| Source intake | Reject malformed descriptor/container/type/length/mask/UTC metadata and detached buffers without coercion. Preserve numeric invalid readings, missing payload bytes and rejected numeric steps. | 56 new source-contract tests; [initial failures](source-contract-initial.txt), [148-test focused pass](source-contract-02.txt) |
| Current worker replies | Check reading tags, summary accounting, finite chart coordinates/domains, drawing budgets, full-range agreement, bounded provenance pages and latest-reading agreement. Ignore superseded payloads before deep validation. Retain prior complete content when a malformed current response stops the session. | 66 response-contract tests and 32 session tests, including all 20 real fixtures at widths 1/120 and single-step frames; [98-test pass](response-contract-final-03.txt) |
| Error handling | Malformed error text gets a bounded fallback; a wrong response kind for an active request fails visibly instead of leaving the load pending. | [Six initial session failures](response-contract-initial.txt), [reproduction records](worker-boundary-reproduction.json) |
| Independent oracle | Derive requested viewport normalization independently; check returned identity/version/counts; compare complete inspected readings, classifications, original indexes and page metadata against raw data. | 21 oracle tests; [15 formerly missed mutations](oracle-mutations-initial.txt), [passing oracle checks](oracle-mutations-final.txt) |
| Reproducible reports | Select individual fixtures/seeds, retain every result and replay command, continue after individual failures and exit nonzero if any case fails. Include source/environment/revision metadata and completed-only totals. | 20 report tests; [41-test oracle/report pass](oracle-report-final.txt), [CLI smoke metadata](cli-smoke.json) |

The oracle exhausts exact inspection groups for sources with at most 512 valid rows. Larger sources use up to 49 representative/anomalous groups; groups over 512 rows sample first/middle/last pages. Dedicated tests verify complete 45-row pagination and bound larger-group audit work. Runtime response checks are bounded by reduced drawing entries and at most 20 inspection rows; their consistency checks are not a proof of every value's provenance.

## Replay

```sh
npm run data:validate
npm run data:validate -- --run run-012
npm run data:validate -- --seed 17
npm run data:validate -- --run run-012 --seed 17
npm run --silent data:validate > report.json
```

Without selectors, all 60 default cases run. With selectors, only the named cases run, with duplicates removed. `--help` explains usage. Seed arguments are decimal unsigned 32-bit integers; invalid flags, IDs or seeds fail. [CLI smoke checks](cli-smoke.json) verified a two-case replay (exit 0), invalid seed rejection (expected exit 1), and help (exit 0). The report schema is version 2; Git metadata is explicitly null when unavailable. The final audit records a dirty tree because documentation/evidence changes were pending; the implementation code was already committed at `239bd67`.

## Retained failures and limits

- Source regressions initially produced 39 failures and 6 passes. Later recipe-shape cases brought the new source suite to 56 tests. No source values were changed to make these tests pass.
- The initial oracle accepted coherent data for the wrong requested viewport. A [small reproduction](oracle-blind-spot-initial.txt) and 15 failing mutation checks were retained before the fix.
- Six response/session regressions initially failed. Independent review additionally caught out-of-domain inspection readings and a latest-step value that disagreed with the summary despite lying inside the overall domain. The latter's [failing check](latest-inspection-initial.txt) is preserved.
- [Three intermediate response-test failures](response-contract-01.txt) came from a table-driven test argument mistake, not the production validator. Named case objects fixed the harness. A concurrent [TypeScript run](oracle-typecheck.txt) caught three nullable pending-request references during editing; explicit guards resolved them. Final integrated checks pass.
- No new Canvas screenshots, real browser fault injection, assistive-technology sessions, timing/memory benchmarks or deployment were performed on this branch. The [charts checkpoint](../charts/verification.md) remains the earlier rendering evidence. This work strengthens data contracts and validation evidence; it does not close those remaining release gates or establish arbitrary external-ingestion correctness.
