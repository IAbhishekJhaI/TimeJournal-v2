"use client";

import type React from "react";
import { useMemo } from "react";
import { Eraser } from "lucide-react";
import type { Category } from "@/lib/api/types";
import { onColor } from "@/lib/color";

export type Brush = string | "erase" | null;

interface Props {
  categories: Category[];
  brush: Brush;
  onSelect: (brush: Brush) => void;
}

/** Persistent category list to the right of the desktop grid. Sets the brush. */
export function DesktopPalette({ categories, brush, onSelect }: Props) {
  const rows = useMemo(() => {
    const active = categories.filter((c) => !c.archived);
    const parents = active.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    const kids = new Map<string, Category[]>();
    for (const c of active) {
      if (!c.parentId) continue;
      const arr = kids.get(c.parentId) ?? [];
      arr.push(c);
      kids.set(c.parentId, arr);
    }
    for (const arr of kids.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    const out: { cat: Category; depth: number }[] = [];
    for (const p of parents) {
      out.push({ cat: p, depth: 0 });
      for (const c of kids.get(p.id) ?? []) out.push({ cat: c, depth: 1 });
    }
    return out;
  }, [categories]);

  return (
    <aside
      style={{
        width: 240,
        flex: "none",
        alignSelf: "flex-start",
        position: "sticky",
        top: 72,
        maxHeight: "calc(100dvh - 96px)",
        overflowY: "auto",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 6,
        background: "var(--surface)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 8px", fontWeight: 500 }}>
        Brush
      </div>
      <button
        onClick={() => onSelect("erase")}
        style={rowStyle(brush === "erase")}
      >
        <span style={{ width: 22, display: "flex", justifyContent: "center", color: "var(--text-muted)" }}>
          <Eraser size={14} />
        </span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Eraser</span>
      </button>

      {rows.map(({ cat, depth }) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          style={{ ...rowStyle(brush === cat.id), paddingLeft: 8 + depth * 16 }}
        >
          <span
            style={{ width: 22, height: 22, borderRadius: 6, flex: "none", background: cat.color, color: onColor(cat.color), fontSize: 9, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {cat.code}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: depth === 0 ? 500 : 400, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {cat.name}
          </span>
        </button>
      ))}
    </aside>
  );
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 8px",
    borderRadius: 8,
    border: "none",
    background: active ? "var(--bg-accent, var(--surface-2))" : "transparent",
    boxShadow: active ? "inset 0 0 0 1px var(--accent)" : "none",
    textAlign: "left",
  };
}
