import type { ReactNode } from "react";

/** Simple "coming soon" scaffold for tabs built in later phases. */
export function Placeholder({
  title,
  phase,
  icon,
}: {
  title: string;
  phase: string;
  icon: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "60dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        color: "var(--text-secondary)",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: "var(--text)" }}>{title}</div>
      <p style={{ fontSize: 13, maxWidth: 260, marginTop: 6 }}>Coming in {phase}.</p>
    </div>
  );
}
