# Training Run Fixtures

The fixture module provides 20 synthetic training runs with deterministic source observations. It generates data on demand, preserving intentional defects for the later normalization and chart implementation. There is no backend, network request, or automatic allocation of all runs when the manifest is imported.

Dataset version: `soup-fixtures-v1`. Generator version: `1.0.0`. Source snapshot: `2026-11-01T12:00:00.000Z`. Status labels are fixture metadata; a synthetic `running` label does not represent a live training process.

## Use the data

```ts
import { RUN_MANIFEST } from "@/features/runs/data/manifest";
import { generateRun } from "@/features/runs/data/generate";

const descriptors = RUN_MANIFEST; // Twenty small descriptors; no point arrays.
const { descriptor, columns } = generateRun("run-020");

columns.step.length;       // 1_000_000
columns.step[500_000];     // 500_000
columns.loss[500_000];     // 12
columns.lr[500_000];       // Original learning-rate observation
columns.grad_norm[500_000];
```

Each descriptor contains ID, name, lifecycle label, seed, generator/source version, source row count, expected step interval, snapshot time, trajectory pattern, and a declarative fixture recipe. Unknown run IDs throw a `RangeError`.

`step`, `loss`, `lr`, and `grad_norm` are parallel `Float64Array` columns. Column index is the original source row position. Each metric also has a `Uint8Array` missing mask: `1` means absent telemetry; `0` means a recorded reading, which can still be numerical NaN or infinity. Columns are aligned even after shuffling. Each generation returns fresh buffers; treat them as source data and normalize through separate indexes rather than mutating them in place.

Recipes use explicit strings for special values so metadata remains safe to serialize. Generated columns contain actual `NaN`, `Infinity`, and `-Infinity`. A missing reading has a NaN storage value and a set missing mask, distinguishing it from a recorded NaN. Do not JSON-stringify raw metrics: ordinary JSON silently turns nonfinite numbers into `null`. The inspection command explicitly labels them instead.

## Fixture allocation

| ID | Source rows | Scenario |
| --- | ---: | --- |
| run-001 | 6,000 | Steady convergence |
| run-002 | 5,000 | Fast convergence |
| run-003 | 8,000 | Slow progress |
| run-004 | 4,000 | Early plateau |
| run-005 | 4,000 | Oscillating loss |
| run-006 | 6,000 | Noisy convergence |
| run-007 | 6,000 | Sustained loss divergence |
| run-008 | 5,000 | Unstable gradients; gradient-only spike of 30 at step 2,500 |
| run-009 | 4,000 | NaN loss at steps 400, 1,600, and the final step 3,999 |
| run-010 | 4,000 | Positive infinite loss at step 900; negative infinite loss at step 2,100 |
| run-011 | 4,003 | Three identical duplicates at steps 500, 1,500, and 2,500 |
| run-012 | 4,003 | Loss conflict containing 12 at step 700; finite/NaN conflict at 1,700; gradient conflict containing 25 at final step 3,999 |
| run-013 | 4,096 | Deterministically shuffled unique steps |
| run-014 | 4,000 | Gaps at steps 600-619 and 2,200-2,249, inclusive |
| run-015 | 4,004 | Shuffled gaps, duplicates, conflicts, NaN/infinite loss, and a distinct missing loss reading |
| run-016 | 4,000 | Valid loss/gradient zeros and a learning-rate schedule ending at zero |
| run-017 | 4,000 | Finite negative loss values |
| run-018 | 3,000 | Constant loss 0.75, learning rate 0.001, and gradient norm 0.5 |
| run-019 | 3,000 | All loss readings are NaN; other metrics remain finite |
| run-020 | 1,000,000 | Steps 0-999,999; a single loss spike of exactly 12 at step 500,000; every other loss is below 2 |

Row counts include duplicate rows. Duplicate observations are appended before optional shuffling, so duplicate fixtures are intentionally not normalized into chronological order. Gaps skip step numbers while preserving the declared source row count; consequently `run-014` ends at step 4,069. The million-point spike replaces an existing loss reading and never adds a row.

The mixed fixture declares missing steps 1,200-1,224 and 2,800-2,809; NaN loss at step 200; infinite loss at 2,200; missing loss at 2,400; and duplicate groups at 450, 900, 1,800, and 3,600. Inspection resolves these steps to their actual source row positions after shuffling.

## Reproduce and inspect

```sh
npm run data:inspect
npm run data:inspect -- run-015
npm run data:inspect -- run-020 --json
npm test
npm run check
```

The default inspection prints a compact table for all 20 runs. Selecting a run prints metadata, observed counts, finite extrema, and source positions for injected readings, duplicate groups, and gap boundaries. `--json` exports these diagnostics with explicit special-value labels, not the million raw observations. These diagnostics are an inspection aid, not the production run-list catalog or canonical chart summaries.

The generator uses a fixed seeded PRNG with a separate shuffle stream. The same descriptor, seed, and generator version produce the same columns. Changing only the shuffle flag permutes complete observations without changing their readings. Trajectory progress depends on the run's final base step; changing the row count or gap recipe can change the generated trajectory. There is no dependency on current time or ambient randomness. Bump the generator/dataset version when changing formulas, seeds, or fixture recipes.

The million-point payload has four Float64 columns and three byte masks: 35,000,000 bytes in those buffers alone. This is a storage calculation, not a browser memory benchmark. Generate the selected run in a worker when the worker integration is implemented, and keep the arrays out of React state and server-rendered props.

## Verification boundary

Fixture tests check exact manifest membership/counts, deterministic generation, column alignment, source preservation, required anomalies, per-metric independence, and the isolated million-point spike. They do not prove future chart normalization, downsampling, rendering, race handling, keyboard access, or browser performance. Those checks belong to the later stages in [BUILD_APPROACH.md](BUILD_APPROACH.md) and [TRD.md](TRD.md).

The [verification artifacts](../evidence/mock-data/README.md) retain the test output, full project check, fixture diagnostics, and tested source hashes.
