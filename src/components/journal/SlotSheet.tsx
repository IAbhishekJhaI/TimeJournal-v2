"use client";

import type React from "react";
import { useState } from "react";
import { ArrowUpToLine, Eraser, X } from "lucide-react";
import type { Category, TimeEntry } from "@/lib/api/types";
import { onColor } from "@/lib/color";
import { slotTimeLabel } from "@/lib/slots";

interface Props {
  slot: number;
  entry: TimeEntry | undefined;
  category: Category | undefined;
  prevEntry: TimeEntry | undefined;
  onSaveNote: (note: string | null) => void;
  onClear: () => void;
  onCopyPrevious: () => void;
  onClose: () => void;
}

export function SlotSheet({
  slot,
  entry,
  category,
  prevEntry,
  onSaveNote,
  onClear,
  onCopyPrevious,
  onClose,
}: Props) {
  const [note, setNote] = useState(entry?.note ?? "");

  const start = slotTimeLabel(slot);
  const end = slot >= 95 ? "24:00" : slotTimeLabel(slot + 1);

  return (
    <div role="dialog" aria-modal="true" aria-label="Slot details" style={overlay}>
      <div onClick={onClose} style={scrim} />
      <div style={sheet}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <span className="tabular" style={{ fontSize: 15, fontWeight: 500 }}>
            {start}–{end}
          </span>
          <button aria-label="Close" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {category ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 26, height: 26, borderRadius: 6, flex: "none",
                    background: category.color, color: onColor(category.color),
                    fontSize: 10, fontWeight: 500,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {category.code}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{category.name}</span>
              </div>

              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>
                  Note (optional)
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="What was this about?"
                  style={textarea}
                />
              </label>

              <button
                onClick={() => onSaveNote(note.trim() || null)}
                style={{ ...primaryBtn, height: 44, justifyContent: "center" }}
              >
                Save note
              </button>

              <button onClick={onClear} style={ghostBtn}>
                <Eraser size={16} /> Clear slot
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
                This slot isn’t logged yet. Pick a category from the palette to paint it, then long-press again to add a note.
              </p>
              {prevEntry ? (
                <button onClick={onCopyPrevious} style={ghostBtn}>
                  <ArrowUpToLine size={16} /> Copy previous slot
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" };
const scrim: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" };
const sheet: React.CSSProperties = { position: "relative", background: "var(--surface)", borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "80dvh", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)" };
const closeBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--surface-2)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" };
const textarea: React.CSSProperties = { width: "100%", padding: 10, fontSize: 15, color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", outline: "none", resize: "vertical" };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 500, color: "var(--accent-contrast)", background: "var(--accent)", border: "none", borderRadius: "var(--radius)" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, color: "var(--text-secondary)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 500 };
