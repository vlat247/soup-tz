import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RUN_MANIFEST } from "@/features/runs/data/manifest";
import { RunDashboard } from "@/features/dashboard/run-dashboard";

type Props = { params: Promise<{ runId: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return RUN_MANIFEST.map((run) => ({ runId: run.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { runId } = await params;
  const run = RUN_MANIFEST.find((entry) => entry.id === runId);
  return { title: run?.name ?? "Run not found" };
}

export default async function RunPage({ params }: Props) {
  const { runId } = await params;
  if (!RUN_MANIFEST.some((run) => run.id === runId)) notFound();
  return <RunDashboard key={runId} runId={runId} />;
}
