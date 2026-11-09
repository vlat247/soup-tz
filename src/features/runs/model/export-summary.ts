import type { RunDescriptor } from "./types";
import type { RunSummary } from "./view-types";

/** Export tagged observations without JSON's silent nonfinite-to-null coercion. */
export function serializeSummaryExport(
  descriptor: RunDescriptor,
  summary: RunSummary,
  loadedAt: string | null,
): string {
  return JSON.stringify({
    descriptor,
    summary,
    loadedAt,
    scope: "Whole-run source summary; finite extrema include duplicate conflicts. Nonfinite readings are explicitly tagged.",
  }, (_key: string, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new RangeError("Summary export contains an untagged nonfinite number");
    return value;
  }, 2);
}
