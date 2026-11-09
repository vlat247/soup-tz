import { getRunDescriptor } from "../runs/data/manifest";
import type { GeneratedRun } from "../runs/model/types";

interface Row {
  step: number;
  loss: number;
  lr?: number;
  grad_norm?: number;
}
const rows = (values: number[]): Row[] =>
  values.map((loss, step) => ({ step, loss }));

/** Small handwritten cases for exercising the real Canvas renderer locally. */
export const CHART_DIAGNOSTICS = [
  {
    id: "singleton",
    name: "Single observation",
    rows: () => [{ step: 7, loss: 2.5 }],
    expect: "One visible marker in each chart, centered at step 7.",
  },
  {
    id: "empty",
    name: "Empty source",
    rows: () => [],
    expect:
      "No line or invented measurements; all charts report no finite readings.",
  },
  {
    id: "constant",
    name: "Constant values",
    rows: () => rows([0.75, 0.75, 0.75]),
    expect: "Horizontal lines with distinct axis labels.",
  },
  {
    id: "invalid",
    name: "All-invalid loss",
    rows: () => rows([NaN, Infinity, -Infinity]),
    expect: "Loss is empty; learning rate and gradient norm remain valid.",
  },
  {
    id: "islands",
    name: "Isolated finite segments",
    rows: () => rows([3, NaN, 2, NaN, 1]),
    expect:
      "Three separate loss markers, with no bridges across invalid steps.",
  },
  {
    id: "gap",
    name: "Missing step interval",
    rows: () => [
      { step: 0, loss: 3 },
      { step: 1, loss: 2 },
      { step: 100, loss: 1 },
      { step: 101, loss: 0.5 },
    ],
    expect: "Every metric breaks between steps 1 and 100.",
  },
  {
    id: "conflict",
    name: "Finite and invalid duplicates",
    rows: () => [
      { step: 0, loss: 5 },
      { step: 1, loss: 1 },
      { step: 1, loss: 100 },
      { step: 1, loss: NaN },
      { step: 2, loss: 4 },
    ],
    expect:
      "Loss breaks at step 1, showing conflict extremes 1 and 100; other metrics remain continuous.",
  },
  {
    id: "zero-negative",
    name: "Zero and negative values",
    rows: () => rows([-2, 0, 1]),
    expect:
      "Zero and negative readings keep their actual positions on a linear scale.",
  },
  {
    id: "subnormal",
    name: "Subnormal magnitudes",
    rows: () =>
      rows([Number.MIN_VALUE, Number.MIN_VALUE * 2, Number.MIN_VALUE * 3]),
    expect: "Three distinct finite levels; exact values remain inspectable.",
  },
  {
    id: "tiny",
    name: "Tiny normal magnitudes",
    rows: () => rows([1e-300, 2e-300, 3e-300]),
    expect: "A rising line with finite coordinates and scientific tick labels.",
  },
  {
    id: "adjacent",
    name: "Adjacent representable values",
    rows: () => rows([1, 1 + Number.EPSILON, 1 + Number.EPSILON * 2]),
    expect:
      "Three distinct levels around 1, without duplicate or clipped tick labels.",
  },
  {
    id: "huge",
    name: "Opposite extreme magnitudes",
    rows: () => rows([-Number.MAX_VALUE, 0, Number.MAX_VALUE]),
    expect:
      "Finite plotted coordinates despite an overflowing raw range subtraction.",
  },
  {
    id: "fragmented",
    name: "Highly fragmented loss",
    rows: () =>
      rows(
        Array.from({ length: 6000 }, (_, i) => (i % 2 ? NaN : 1 + (i % 37))),
      ),
    expect:
      "Disconnected extrema at small drawing budgets; no fabricated connected path.",
  },
  {
    id: "pagination",
    name: "45 duplicate source rows",
    rows: () =>
      Array.from({ length: 45 }, (_, i) => ({ step: 10, loss: i + 1 })),
    expect:
      "Conflict extremes 1 and 45; all 45 rows accessible in pages of 20, 20 and 5.",
  },
] as const;

export function makeDiagnosticSource(id: string): GeneratedRun {
  const fixture = CHART_DIAGNOSTICS.find((entry) => entry.id === id);
  if (!fixture) throw new Error("Unknown chart diagnostic");
  const values: Row[] = fixture.rows();
  return {
    descriptor: {
      ...getRunDescriptor("run-001"),
      name: fixture.name,
      rowCount: values.length,
      fixture: {},
    },
    columns: {
      step: Float64Array.from(values, (row) => row.step),
      loss: Float64Array.from(values, (row) => row.loss),
      lr: Float64Array.from(values, (row) => row.lr ?? 0.001),
      grad_norm: Float64Array.from(values, (row) => row.grad_norm ?? 1),
      missing: {
        loss: new Uint8Array(values.length),
        lr: new Uint8Array(values.length),
        grad_norm: new Uint8Array(values.length),
      },
    },
  };
}
