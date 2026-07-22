"use client";

import { LogOut } from "lucide-react";
import { useProfile } from "@/lib/client/hooks";

export default function SettingsPage() {
  const { data: profile, isLoading } = useProfile();

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "8px 0 16px" }}>Settings</h1>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <Field label="Email" value={isLoading ? "…" : profile?.email ?? "—"} />
        <Field label="Display name" value={isLoading ? "…" : profile?.displayName ?? "Not set"} />
        <Field label="Timezone" value={isLoading ? "…" : profile?.timezone ?? "—"} />
        <Field
          label="Sheet export"
          value={
            isLoading ? "…" : profile?.sheetSpreadsheetId ? "Connected" : "Not connected"
          }
          last
        />
      </section>

      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "10px 2px 20px" }}>
        Editing profile, timezone, sheet target and invites lands in Phase 4.
      </p>

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          style={{
            width: "100%",
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            color: "var(--danger)",
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 14px",
        borderBottom: last ? "none" : "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 14, color: "var(--text)" }}>{value}</span>
    </div>
  );
}
