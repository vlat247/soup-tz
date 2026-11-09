import type { RunDescriptor } from "./types";
import type { RunSummary } from "./view-types";
import { qualityCount } from "./format";

export type RunSort = "id" | "name" | "steps" | "loss" | "loss-desc";
export interface BrowserFilters {
  search: string;
  quality: string;
  sort: RunSort;
  status: string;
}
export interface RunListEntry {
  run: RunDescriptor;
  summary: RunSummary;
}

/** Sort source numbers, never rounded labels; unavailable loss stays last in either direction. */
export function selectRunList(entries: readonly RunListEntry[], filters: BrowserFilters): RunListEntry[] {
  const search = filters.search.toLowerCase().trim();
  return entries.filter(({ run, summary }) => {
    const matchesText = `${run.name} ${run.id}`.toLowerCase().includes(search);
    const issues = qualityCount(summary) > 0;
    return matchesText &&
      (filters.quality === "all" || (filters.quality === "issues" ? issues : !issues)) &&
      (filters.status === "all" || run.status === filters.status);
  }).toSorted((a, b) => {
    const byId = a.run.id.localeCompare(b.run.id, "en-US");
    if (filters.sort === "name") return a.run.name.localeCompare(b.run.name, "en-US") || byId;
    if (filters.sort === "steps") return b.summary.lastStep - a.summary.lastStep || byId;
    if (filters.sort === "loss" || filters.sort === "loss-desc") {
      const left = a.summary.lastFinite.loss?.value;
      const right = b.summary.lastFinite.loss?.value;
      const leftFinite = typeof left === "number" && Number.isFinite(left);
      const rightFinite = typeof right === "number" && Number.isFinite(right);
      if (leftFinite !== rightFinite) return leftFinite ? -1 : 1;
      if (!leftFinite || !rightFinite) return byId;
      const comparison = left < right ? -1 : left > right ? 1 : 0;
      return (filters.sort === "loss-desc" ? -comparison : comparison) || byId;
    }
    return byId;
  });
}
