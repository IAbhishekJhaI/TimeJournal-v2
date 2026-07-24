"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  useAnalytics,
  useCategories,
  useCreateSavedQuery,
  useDeleteSavedQuery,
  useSavedQueries,
  useUpdateSavedQuery,
} from "@/lib/client/hooks";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import { onColor } from "@/lib/color";
import type { Category, SavedQuery } from "@/lib/api/types";

type Period = "day" | "week" | "month" | "year";

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Saved-query tiles on the dashboard: each query is a named group of categories
 * (e.g. "Outdoors = Fá+Fi+He"), and the tile sums the selected period's minutes
 * across those categories. Tap a tile to edit; "+ New" to create. (ARCHITECTURE
 * §5, FRONTEND_PLAN §4.3.)
 */
export function SavedQueries({ period, anchor }: { period: Period; anchor: string }) {
  const { data: queries } = useSavedQueries();
  // Category-level totals for the current period, regardless of the page's
  // groupBy, so a query can sum its own categories.
  const { data: analytics } = useAnalytics(period, anchor, "category");
  const [editing, setEditing] = useState<SavedQuery | "new" | null>(null);

  const minutesByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of analytics?.buckets ?? []) m.set(b.key, b.minutes);
    return m;
  }, [analytics]);

  const queryTotal = (q: SavedQuery) =>
    q.categoryIds.reduce((sum, id) => sum + (minutesByCategory.get(id) ?? 0), 0);

  const hasQueries = (queries ?? []).length > 0;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Saved queries</h2>
        <button onClick={() => setEditing("new")} style={newBtn}>
          <Plus size={15} /> New
        </button>
      </div>

      {!hasQueries ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          Group categories into a custom total — e.g. “Outdoors” across several codes.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {(queries ?? []).map((q) => (
            <button key={q.id} onClick={() => setEditing(q)} style={tile}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {q.name}
              </span>
              <span className="tabular" style={{ fontSize: 20, fontWeight: 500, color: "var(--text)" }}>
                {fmtDuration(queryTotal(q))}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {q.categoryIds.length} categor{q.categoryIds.length === 1 ? "y" : "ies"} · this {period}
              </span>
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <QueryEditor query={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function QueryEditor({ query, onClose }: { query: SavedQuery | null; onClose: () => void }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { data: categories } = useCategories();
  const create = useCreateSavedQuery();
  const update = useUpdateSavedQuery();
  const del = useDeleteSavedQuery();

  const [name, setName] = useState(query?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(query?.categoryIds ?? []));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Ordered category list (parents then their children) for a readable picker.
  const ordered = useMemo(() => {
    const active = (categories ?? []).filter((c) => !c.archived);
    const parents = active.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    const kids = new Map<string, Category[]>();
    for (const c of active) {
      if (!c.parentId) continue;
      const arr = kids.get(c.parentId) ?? [];
      arr.push(c);
      kids.set(c.parentId, arr);
    }
    for (const arr of kids.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    const out: Category[] = [];
    for (const p of parents) {
      out.push(p);
      for (const k of kids.get(p.id) ?? []) out.push(k);
    }
    return out;
  }, [categories]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSave = name.trim().length > 0 && selected.size > 0;
  const busy = create.isPending || update.isPending || del.isPending;

  async function onSave() {
    if (!canSave) return;
    const body = { name: name.trim(), categoryIds: [...selected] };
    if (query) await update.mutateAsync({ id: query.id, body });
    else await create.mutateAsync(body);
    onClose();
  }

  async function onDelete() {
    if (!query) return;
    await del.mutateAsync(query.id);
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={query ? "Edit saved query" : "New saved query"} style={overlay(isDesktop)}>
      <div onClick={onClose} style={scrim} />
      <div style={sheet(isDesktop)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{query ? "Edit query" : "New query"}</span>
          <button aria-label="Close" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Outdoors time"
              style={input}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
              Categories ({selected.size} selected)
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto", maxHeight: isDesktop ? 320 : "40dvh", padding: 2 }}>
              {ordered.map((c) => {
                const active = selected.has(c.id);
                return (
                  <button key={c.id} onClick={() => toggle(c.id)} style={catChip(active, c.parentId != null)}>
                    <span style={{ width: 18, height: 18, borderRadius: 4, flex: "none", background: c.color, color: onColor(c.color), fontSize: 8, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {c.code}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={onSave} disabled={!canSave || busy} style={{ ...primaryBtn, flex: 1, opacity: !canSave || busy ? 0.5 : 1 }}>
              {busy ? "Saving…" : query ? "Save changes" : "Create query"}
            </button>
            {query ? (
              <button onClick={onDelete} disabled={busy} aria-label="Delete query" style={deleteBtn}>
                <Trash2 size={17} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const newBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "var(--accent)", background: "none", border: "1px solid var(--border)", borderRadius: 20, padding: "5px 10px", cursor: "pointer" };
const tile: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start", textAlign: "left", padding: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", minWidth: 0 };

const overlay = (isDesktop: boolean): React.CSSProperties => ({ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: isDesktop ? "flex-start" : "flex-end", alignItems: isDesktop ? "center" : undefined, paddingTop: isDesktop ? "10vh" : undefined });
const scrim: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" };
const sheet = (isDesktop: boolean): React.CSSProperties => ({ position: "relative", width: isDesktop ? "min(520px, 92vw)" : undefined, background: "var(--surface)", borderRadius: isDesktop ? 16 : "16px 16px 0 0", maxHeight: "85dvh", overflowY: "auto", display: "flex", flexDirection: "column", paddingBottom: isDesktop ? 0 : "env(safe-area-inset-bottom)", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" });
const closeBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--surface-2)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 15, color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", outline: "none" };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 44, fontSize: 15, fontWeight: 600, color: "var(--accent-contrast)", background: "var(--accent)", border: "none", borderRadius: "var(--radius)", cursor: "pointer" };
const deleteBtn: React.CSSProperties = { width: 44, height: 44, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", cursor: "pointer" };

function catChip(active: boolean, isChild: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px 5px 5px",
    fontSize: 12,
    fontWeight: isChild ? 400 : 500,
    borderRadius: 18,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
    background: active ? "var(--surface-2)" : "var(--surface)",
    color: "var(--text)",
    boxShadow: active ? "inset 0 0 0 1px var(--accent)" : "none",
    cursor: "pointer",
  };
}
