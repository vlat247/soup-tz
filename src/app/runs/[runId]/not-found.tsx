import Link from "next/link";

export default function RunNotFound() {
  return (
    <section style={{ padding: "80px 24px", maxWidth: 520 }}>
      <h1 style={{ fontWeight: 500, fontSize: 28 }}>Run not found</h1>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
        This run isn’t in the dataset. Choose another run to continue.
      </p>
      <Link
        href="/runs/run-001"
        style={{
          color: "var(--text)",
          textDecorationColor: "var(--accent)",
          textUnderlineOffset: 4,
          display: "inline-block",
          marginTop: 18,
        }}
      >
        Browse training runs →
      </Link>
    </section>
  );
}
