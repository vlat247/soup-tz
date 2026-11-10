import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/geist";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "soup — Training runs", template: "%s · soup" },
  description: "Explore training runs, metrics, and data quality.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
