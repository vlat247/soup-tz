import { notFound } from "next/navigation";
import { SilentFailureDiagnostics } from "@/features/diagnostics/silent-failure-diagnostics";

export const metadata = { title: "Silent failure diagnostics", robots: { index: false, follow: false } };

export default function SilentFailuresPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SilentFailureDiagnostics />;
}
