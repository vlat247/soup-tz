import Link from "next/link";

export default function RunNotFound() {
  return <section style={{ padding: "80px 24px", maxWidth: 520 }}><p style={{ color: "var(--muted)" }}>Run not found</p><h1 style={{ fontWeight: 500, fontSize: 28 }}>This run isn’t in the dataset.</h1><p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>Choose one of the 20 training runs in the sidebar or return to the first run.</p><Link href="/runs/run-001" style={{ color: "var(--accent)", display: "inline-block", marginTop: 18 }}>Browse training runs →</Link></section>;
}
