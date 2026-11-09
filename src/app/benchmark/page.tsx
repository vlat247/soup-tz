import { notFound } from "next/navigation";
import { BrowserBenchmark } from "@/features/benchmark/browser-benchmark";

export const metadata = { title: "Performance comparison", robots: { index: false, follow: false } };

export default function BenchmarkPage() {
  if (process.env.NODE_ENV !== "development" && process.env.NEXT_PUBLIC_ENABLE_BENCHMARK !== "1") notFound();
  return <BrowserBenchmark />;
}
