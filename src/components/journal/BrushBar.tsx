"use client";

import type { Category } from "@/lib/api/types";
import { onColor } from "@/lib/color";

interface Props {
  brush: Category | null;
  recent: Category[];
  onPickRecent: (id: string) => void;
  onOpenPalette: () => void;
}

export function BrushBar({ brush, recent, onPickRecent, onOpenPalette }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom))",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        padding: "8px 12px",
        zIndex: 30,
      }}
    >
      <button
        onClick={onOpenPalette}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "8px 12px",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            flex: "none",
            background: brush?.color ?? "var(--border-strong)",
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
            {brush ? `${brush.name} · ${brush.code}` : "Pick a category"}
          </span>
          <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary)" }}>
            {brush ? "Brush — tap slots to fill" : "Tap to choose your brush"}
          </span>
        </span>
        <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>Change</span>
      </button>

      {recent.length > 0 ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
          {recent.map((c) => (
            <button
              key={c.id}
              onClick={() => onPickRecent(c.id)}
              style={{
                flex: "none",
                fontSize: 11,
                fontWeight: 500,
                padding: "5px 10px",
                borderRadius: 20,
                border: "none",
                background: c.color,
                color: onColor(c.color),
              }}
            >
              {c.code}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
