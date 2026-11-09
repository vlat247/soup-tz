import { notFound } from "next/navigation";
import { ChartDiagnostics } from "@/features/diagnostics/chart-diagnostics";

export const metadata = {
  title: "Chart diagnostics",
  robots: { index: false, follow: false },
};

export default function ChartDiagnosticsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ChartDiagnostics />;
}
