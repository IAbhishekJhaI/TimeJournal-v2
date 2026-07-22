"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { Category } from "@/lib/api/types";
import { onColor } from "@/lib/color";

interface Props {
  open: boolean;
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function CategorySheet({ open, categories, selectedId, onSelect, onClose }: Props) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const active = categories.filter((c) => !c.archived);
    const needle = q.trim().toLowerCase();
    const match = (c: Category) =>
      !needle || c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle);

    const roots = active
      .filter((c) => !c.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return roots
      .map((root) => ({
        root,
        children: active
          .filter((c) => c.parentId === root.id && match(c))
          .sort((a, b) => a.sortOrder - b.sortOrder),
        rootMatches: match(root),
      }))
      .filter((g) => g.rootMatches || g.children.length > 0);
  }, [categories, q]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a category"
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
    >
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
      />
      <div
        style={{
          position: "relative",
          background: "var(--surface)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: "75dvh",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Categories</span>
          <button aria-label="Close" onClick={onClose} style={iconBtn}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "0 16px 8px" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              style={{
                width: "100%",
                height: 40,
                padding: "0 12px 0 32px",
                fontSize: 15,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--text)",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "0 12px 16px" }}>
          {groups.map(({ root, children }) => (
            <div key={root.id} style={{ marginTop: 8 }}>
              <Row cat={root} selected={selectedId === root.id} onSelect={onSelect} bold />
              {children.map((c) => (
                <div key={c.id} style={{ paddingLeft: 18 }}>
                  <Row cat={c} selected={selectedId === c.id} onSelect={onSelect} />
                </div>
              ))}
            </div>
          ))}
          {groups.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 24 }}>
              No categories match.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "none",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function Row({
  cat,
  selected,
  onSelect,
  bold,
}: {
  cat: Category;
  selected: boolean;
  onSelect: (id: string) => void;
  bold?: boolean;
}) {
  return (
    <button
      onClick={() => onSelect(cat.id)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 8px",
        borderRadius: 8,
        border: "none",
        background: selected ? "var(--surface-2)" : "transparent",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          flex: "none",
          background: cat.color,
          color: onColor(cat.color),
          fontSize: 10,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {cat.code}
      </span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: bold ? 500 : 400, color: "var(--text)" }}>
        {cat.name}
      </span>
      {selected ? <Check size={16} style={{ color: "var(--accent)" }} /> : null}
    </button>
  );
}
