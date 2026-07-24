"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { Download, LogOut, RefreshCw, Upload } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { api } from "@/lib/client/api";
import {
  useExportNow,
  useImportXlsx,
  useProfile,
  useUpdateProfile,
} from "@/lib/client/hooks";
import { slotTimeLabel } from "@/lib/slots";

function extractSheetId(input: string): string {
  const m = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return (m ? m[1] : input).trim();
}

export default function SettingsPage() {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState("");
  const [sheet, setSheet] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(profile.displayName ?? "");
    setSheet(profile.sheetSpreadsheetId ?? "");
  }, [profile]);

  function saveProfile() {
    updateProfile.mutate({
      displayName: name.trim() || null,
      sheetSpreadsheetId: sheet.trim() ? extractSheetId(sheet) : null,
    });
  }

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "8px 0 16px" }}>Settings</h1>

      <Section title="Profile">
        <Field label="Email">
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{profile?.email ?? "…"}</div>
        </Field>
        <Field label="Display name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={input} />
        </Field>
        <Field label="Timezone">
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            {profile?.timezone ?? "…"} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(detected automatically)</span>
          </div>
        </Field>
      </Section>

      <Section title="Google Sheets export">
        <p style={muted}>The sheet the export worker mirrors your logged time into. Paste the sheet URL or its ID.</p>
        <Field label="Spreadsheet">
          <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" style={input} />
        </Field>
        <ExportNowButton />
      </Section>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 20px" }}>
        <button onClick={saveProfile} disabled={updateProfile.isPending} style={{ ...primaryBtn, opacity: updateProfile.isPending ? 0.6 : 1 }}>
          {updateProfile.isPending ? "Saving…" : "Save changes"}
        </button>
        {updateProfile.isSuccess ? <span style={{ fontSize: 13, color: "var(--success)" }}>Saved</span> : null}
        {updateProfile.isError ? <span style={{ fontSize: 13, color: "var(--danger)" }}>{(updateProfile.error as Error).message}</span> : null}
      </div>

      <ImportSection />

      <DataSection />

      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useClerk();
  return (
    <button onClick={() => signOut({ redirectUrl: "/sign-in" })} style={{ ...dangerBtn, marginTop: 8 }}>
      <LogOut size={16} /> Sign out
    </button>
  );
}

function ExportNowButton() {
  const exportNow = useExportNow();
  const res = exportNow.data;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
      <button onClick={() => exportNow.mutate()} disabled={exportNow.isPending} style={secondaryBtn}>
        <RefreshCw size={15} className={exportNow.isPending ? "tj-spin" : undefined} /> Export now
      </button>
      {res ? (
        <span style={{ fontSize: 13, color: res.failed.length ? "var(--warning)" : "var(--success)" }}>
          {res.processed} exported{res.failed.length ? `, ${res.failed.length} failed` : ""}
        </span>
      ) : null}
      {exportNow.isError ? <span style={{ fontSize: 13, color: "var(--danger)" }}>{(exportNow.error as Error).message}</span> : null}
    </div>
  );
}

function ImportSection() {
  const importXlsx = useImportXlsx();
  const [file, setFile] = useState<File | null>(null);
  const result = importXlsx.data;

  return (
    <Section title="Import from Google Sheet">
      <p style={muted}>
        In Google Sheets choose <strong>File → Download → Microsoft Excel (.xlsx)</strong>, then upload
        it here. Reads the <code>Categories</code> and <code>Days</code> tabs, builds your category
        tree, and imports every logged slot (validating counts against the sheet&apos;s own totals).
        Best run on a fresh account — a category code that already exists will clash.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ ...secondaryBtn, cursor: "pointer" }}>
          <Upload size={15} /> {file ? "Change file" : "Choose .xlsx"}
          <input
            type="file"
            accept=".xlsx"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file ? <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{file.name}</span> : null}
        <button
          onClick={() => file && importXlsx.mutate(file)}
          disabled={!file || importXlsx.isPending}
          style={{ ...primaryBtn, height: 38, opacity: !file || importXlsx.isPending ? 0.5 : 1 }}
        >
          {importXlsx.isPending ? "Importing…" : "Import"}
        </button>
      </div>

      {importXlsx.isError ? (
        <p style={{ fontSize: 13, color: "var(--danger)", margin: "8px 0 0" }}>
          {(importXlsx.error as Error).message}
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 8, fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--success)" }}>
            Imported {result.categoriesCreated} categories and {result.entriesCreated} slots.
          </span>
          {result.unknownCodes.length > 0 ? (
            <span style={{ color: "var(--warning)" }}>
              Skipped {result.unknownCodes.length} unknown code(s): {result.unknownCodes.join(", ")}
            </span>
          ) : null}
          {result.validationMismatches.length > 0 ? (
            <span style={{ color: "var(--warning)" }}>
              {result.validationMismatches.length} category total(s) didn&apos;t match the sheet — worth a look.
            </span>
          ) : null}
          <span style={{ color: "var(--text-muted)" }}>
            Colours use a placeholder palette — recolour in the Categories editor.
          </span>
        </div>
      ) : null}
    </Section>
  );
}

function DataSection() {
  const year = new Date().getUTCFullYear();
  const [busy, setBusy] = useState(false);

  async function exportCsv() {
    setBusy(true);
    try {
      const [entries, cats] = await Promise.all([
        api.getEntries(`${year}-01-01`, `${year}-12-31`),
        api.getCategories(true),
      ]);
      const codeById = new Map(cats.map((c) => [c.id, c.code]));
      const lines = ["day,slot,time,code,note"];
      for (const e of entries) {
        const note = e.note ? `"${e.note.replace(/"/g, '""')}"` : "";
        lines.push(`${e.day},${e.slot},${slotTimeLabel(e.slot)},${codeById.get(e.categoryId) ?? ""},${note}`);
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timejournal-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Your data">
      <p style={muted}>Download this year&apos;s logged slots as a CSV.</p>
      <button onClick={exportCsv} disabled={busy} style={secondaryBtn}>
        <Download size={15} /> {busy ? "Preparing…" : `Export ${year} (CSV)`}
      </button>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", margin: "0 0 8px" }}>{title}</h2>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", fontSize: 15,
  color: "var(--text)", background: "var(--surface-2)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)", outline: "none",
};
const muted: React.CSSProperties = { fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" };
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 16px", fontSize: 14, fontWeight: 500,
  color: "var(--accent-contrast)", background: "var(--accent)", border: "none", borderRadius: "var(--radius)",
};
const secondaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", fontSize: 14, fontWeight: 500,
  color: "var(--text)", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
};
const dangerBtn: React.CSSProperties = {
  width: "100%", height: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
  color: "var(--danger)", fontSize: 15, fontWeight: 500,
};
