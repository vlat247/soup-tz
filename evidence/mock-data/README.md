# Mock Data Verification

This evidence covers the 20-run source fixture generator on `feature/mock-data`. Verification was captured before committing the implementation; `verification.json` records its base commit and SHA-256 hashes of the tested inputs. No chart, browser timing, or tab-memory claim is made by these files.

| File | Contents |
| --- | --- |
| [project-check.txt](project-check.txt) | Complete final `npm run check` output: lint, type checking, 58 fixture tests, and production build. |
| [verification.json](verification.json) | Command, exit code, environment, branch, base commit, and tested input hashes. |
| [fixture-summary.txt](fixture-summary.txt) | Actual `npm run data:inspect` output for all 20 runs. |
| [fixture-report.json](fixture-report.json) | Structured diagnostics and exact injected anomaly source positions; no full point arrays. |
| [mock-data-01.txt](mock-data-01.txt) | Initial passing test run, including its configuration warning. |
| [mock-data-02.txt](mock-data-02.txt) | Subsequent passing run after removing the unnecessary test configuration and strengthening spike checks. |

All 58 fixture tests passed in the final check. Test-runner durations are execution diagnostics, not the assignment's browser performance measurements.

During inspection, the `tsx` CLI initially failed because the sandbox disallowed its IPC socket (`EPERM`). Running the same script with `node --import tsx` succeeded, and the npm script now uses that form. No source-data test failure was observed. The unknown-ID CLI path was also checked: `run-021` exits unsuccessfully with an explicit error.

For fixture behavior and usage, see [MOCK_DATA.md](../../docs/MOCK_DATA.md). Future normalization, reduction, rendering, accessibility, request-race, and performance evidence must be captured separately.
