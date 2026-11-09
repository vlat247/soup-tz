import type { ReactNode } from "react";
import { DashboardShell } from "@/features/dashboard/dashboard-shell";

export default function RunsLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
