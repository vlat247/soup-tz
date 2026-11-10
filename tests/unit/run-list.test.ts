import { describe, expect, it } from "vitest";
import catalog from "../../src/features/runs/data/catalog.json";
import { getRunDescriptor, RUN_MANIFEST } from "../../src/features/runs/data/manifest";
import { selectRunList, type BrowserFilters, type RunListEntry } from "../../src/features/runs/model/run-list";
import type { CatalogEntry, Reading } from "../../src/features/runs/model/view-types";

const filters: BrowserFilters = { search: "", quality: "all", status: "all", sort: "id" };
const base = (catalog as CatalogEntry[])[0].summary;
function entry(id: string, loss: number | null, latest: Reading = { kind: "finite", value: loss }): RunListEntry {
  return {
    run: { ...getRunDescriptor("run-001"), id, name: `Run ${id}` },
    summary: { ...base, lastFinite: { ...base.lastFinite, loss: loss === null ? null : { value: loss, step: 12 } }, latest: { ...base.latest, loss: latest } },
  };
}
const ids = (items: RunListEntry[]) => items.map(({ run }) => run.id);

describe("run catalog ordering and filtering", () => {
  const values = [entry("ten", 10), entry("two", 2), entry("zero", 0), entry("negative", -1), entry("missing", null, { kind: "missing", value: null })];

  it("sorts numeric values rather than their formatted labels", () => {
    expect(ids(selectRunList(values, { ...filters, sort: "loss" })))
      .toEqual(["negative", "zero", "two", "ten", "missing"]);
    expect(ids(selectRunList(values, { ...filters, sort: "loss-desc" })))
      .toEqual(["ten", "two", "zero", "negative", "missing"]);
  });

  it("keeps unavailable values last and deterministic in both directions", () => {
    const items = [entry("unavailable-z", null), entry("finite", 0), entry("unavailable-a", NaN), entry("unavailable-b", Infinity)];
    for (const sort of ["loss", "loss-desc"] as const) {
      expect(ids(selectRunList(items, { ...filters, sort })))
        .toEqual(["finite", "unavailable-a", "unavailable-b", "unavailable-z"]);
    }
  });

  it("uses earlier unambiguous finite readings without replacing current invalid/conflict states", () => {
    const items = [entry("nan", 2, { kind: "nan", value: null }), entry("conflict", 4, { kind: "conflict", value: null }), entry("finite", 3)];
    const before = structuredClone(items);
    expect(ids(selectRunList(items, { ...filters, sort: "loss-desc" }))).toEqual(["conflict", "finite", "nan"]);
    expect(items).toEqual(before);
  });

  it("orders extreme and nearly equal finite values without string rounding or overflowing subtraction", () => {
    const items = [entry("max", Number.MAX_VALUE), entry("next", 1 + Number.EPSILON), entry("one", 1), entry("min", -Number.MAX_VALUE)];
    expect(ids(selectRunList(items, { ...filters, sort: "loss" }))).toEqual(["min", "one", "next", "max"]);
    expect(ids(selectRunList(items, { ...filters, sort: "loss-desc" }))).toEqual(["max", "next", "one", "min"]);
  });

  it("uses ascending IDs to break equal-number ties in either direction, independent of arrival order", () => {
    for (const sort of ["loss", "loss-desc"] as const) {
      const tied = [entry("b", 0), entry("c", -0), entry("a", 0)];
      expect(ids(selectRunList(tied, { ...filters, sort }))).toEqual(["a", "b", "c"]);
      expect(ids(selectRunList(tied.toReversed(), { ...filters, sort }))).toEqual(["a", "b", "c"]);
    }
  });

  const actual = (catalog as CatalogEntry[]).map(({ id, summary }) => ({ run: getRunDescriptor(id), summary }));
  it("returns all twenty fixtures by default and composes name/ID, quality and status filters", () => {
    expect(ids(selectRunList(actual, filters))).toEqual(RUN_MANIFEST.map((run) => run.id));
    expect(ids(selectRunList(actual, { ...filters, search: "  RUN-019  ", quality: "issues", status: "failed" }))).toEqual(["run-019"]);
    expect(selectRunList(actual, { ...filters, search: "RUN-019", quality: "clean" })).toEqual([]);
    expect(ids(selectRunList(actual, { ...filters, search: "fast convergence" }))).toEqual(["run-002"]);
  });

  it("places all-invalid run-019 after the finite fixture values in both directions", () => {
    expect(selectRunList(actual, { ...filters, sort: "loss" }).at(-1)?.run.id).toBe("run-019");
    expect(selectRunList(actual, { ...filters, sort: "loss-desc" }).at(-1)?.run.id).toBe("run-019");
  });

  it("supports an empty catalog independently of filters that match no records", () => {
    expect(selectRunList([], filters)).toEqual([]);
    const snapshot = actual.slice();
    expect(selectRunList(actual, { ...filters, search: "no such run" })).toEqual([]);
    expect(actual).toEqual(snapshot);
    expect(actual).toHaveLength(20);
  });
});
