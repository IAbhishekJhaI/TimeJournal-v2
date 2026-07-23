"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { ChevronRight, Eraser } from "lucide-react";
import type { Category } from "@/lib/api/types";
import { onColor } from "@/lib/color";

interface Props {
  x: number;
  y: number; // anchor point (viewport coords)
  categories: Category[];
  recent: Category[];
  onPick: (categoryId: string | null) => void; // null = eraser
  onClose: () => void;
}

export function CategoryPicker({ x, y, categories, recent, onPick, onClose }: Props) {
  const [activeParent, setActiveParent] = useState<Category | null>(null);

  const { parents, childrenByParent } = useMemo(() => {
    const active = categories.filter((c) => !c.archived);
    const parents = active.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    const childrenByParent = new Map<string, Category[]>();
    for (const c of active) {
      if (!c.parentId) continue;
      const arr = childrenByParent.get(c.parentId) ?? [];
      arr.push(c);
      childrenByParent.set(c.parentId, arr);
    }
    for (const arr of childrenByParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return { parents, childrenByParent };
  }, [categories]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const panelW = Math.min(180, Math.floor((vw - 24 - 6) / 2));
  const twoW = panelW * 2 + 6;
  const maxH = Math.min(360, Math.floor(vh * 0.6));
  const left = Math.max(8, Math.min(x - panelW / 2, vw - twoW - 8));
  // Open upward when anchored near the bottom (e.g. the mobile brush button).
  const openUp = y > vh * 0.55;
  const top = openUp
    ? Math.max(8, y - maxH - 12)
    : Math.max(8, Math.min(y + 12, vh - maxH - 8));

  const subChildren = activeParent ? childrenByParent.get(activeParent.id) ?? [] : [];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left, top, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <Panel width={panelW} maxH={maxH}>
          <Header label="Category" />
          <PlainRow onClick={() => onPick(null)} icon={<Eraser size={14} />} label="Eraser" muted />
          {recent.length > 0 ? (
            <>
              <GroupLabel>Recent</GroupLabel>
              {recent.map((c) => (
                <CatRow key={`r-${c.id}`} cat={c} onClick={() => onPick(c.id)} />
              ))}
              <GroupLabel>All</GroupLabel>
            </>
          ) : null}
          {parents.map((p) => {
            const hasKids = (childrenByParent.get(p.id)?.length ?? 0) > 0;
            return (
              <CatRow
                key={p.id}
                cat={p}
                bold
                active={activeParent?.id === p.id}
                trailing={hasKids ? <ChevronRight size={14} style={{ opacity: 0.5 }} /> : undefined}
                onClick={() => (hasKids ? setActiveParent(p) : onPick(p.id))}
              />
            );
          })}
        </Panel>

        {activeParent ? (
          <Panel width={panelW} maxH={maxH}>
            <Header label={activeParent.name} />
            <CatRow cat={activeParent} label={`${activeParent.name} · general`} onClick={() => onPick(activeParent.id)} />
            {subChildren.map((c) => (
              <CatRow key={c.id} cat={c} onClick={() => onPick(c.id)} />
            ))}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function Panel({ width, maxH, children }: { width: number; maxH: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        width,
        maxHeight: maxH,
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        padding: 4,
      }}
    >
      {children}
    </div>
  );
}

function Header({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 8px 4px", fontWeight: 500 }}>
      {label}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "6px 8px 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </div>
  );
}

function PlainRow({ onClick, icon, label, muted }: { onClick: () => void; icon: React.ReactNode; label: string; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px", borderRadius: 8, border: "none", background: "transparent", color: muted ? "var(--text-secondary)" : "var(--text)", fontSize: 13, textAlign: "left" }}
    >
      <span style={{ width: 22, display: "flex", justifyContent: "center", color: "var(--text-muted)" }}>{icon}</span>
      {label}
    </button>
  );
}

function CatRow({
  cat,
  label,
  bold,
  active,
  trailing,
  onClick,
}: {
  cat: Category;
  label?: string;
  bold?: boolean;
  active?: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, border: "none", background: active ? "var(--surface-2)" : "transparent", textAlign: "left" }}
    >
      <span
        style={{ width: 22, height: 22, borderRadius: 6, flex: "none", background: cat.color, color: onColor(cat.color), fontSize: 9, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {cat.code}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: bold ? 500 : 400, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label ?? cat.name}
      </span>
      {trailing ?? null}
    </button>
  );
}
