"use client";

import type React from "react";
import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  X,
} from "lucide-react";
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useReorderCategories,
  useUpdateCategory,
} from "@/lib/client/hooks";
import type { Category } from "@/lib/api/types";
import { onColor } from "@/lib/color";

const PRESET_COLORS = [
  "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#f59e0b", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#64748b", "#78716c",
];

interface TreeNode extends Category {
  children: TreeNode[];
}

function buildTree(cats: Category[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(cats.map((c) => [c.id, { ...c, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    arr.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** ids of a node and all its descendants (to exclude as re-parent targets). */
function subtreeIds(node: TreeNode, acc: Set<string> = new Set()): Set<string> {
  acc.add(node.id);
  node.children.forEach((c) => subtreeIds(c, acc));
  return acc;
}

type EditTarget =
  | { mode: "new"; parentId: string | null }
  | { mode: "edit"; category: Category };

export function CategoryEditor() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: categories, isLoading } = useCategories(showArchived);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const reorder = useReorderCategories();

  const tree = useMemo(() => buildTree(categories ?? []), [categories]);

  function move(node: TreeNode, dir: -1 | 1) {
    setBanner(null);
    const siblings = (node.parentId
      ? (categories ?? []).filter((c) => c.parentId === node.parentId)
      : (categories ?? []).filter((c) => !c.parentId)
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const i = siblings.findIndex((c) => c.id === node.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    reorder.mutate(
      reordered.map((c, idx) => ({ id: c.id, sortOrder: idx })),
      { onError: (e) => setBanner(e instanceof Error ? e.message : "Could not reorder.") },
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: "8px 0" }}>Categories</h1>
        <button
          onClick={() => { setBanner(null); setEditing({ mode: "new", parentId: null }); }}
          style={primaryBtn}
        >
          <Plus size={16} /> Add
        </button>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 12px" }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived
      </label>

      {banner ? (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--danger)", fontSize: 13, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          {banner}
        </div>
      ) : null}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>
      ) : tree.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          No categories yet. Tap “Add” to create your first one.
        </p>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {tree.map((node, i) => (
            <NodeRow
              key={node.id}
              node={node}
              depth={0}
              first={i === 0}
              onEdit={(c) => { setBanner(null); setEditing({ mode: "edit", category: c }); }}
              onAddChild={(pid) => { setBanner(null); setEditing({ mode: "new", parentId: pid }); }}
              onMove={move}
            />
          ))}
        </div>
      )}

      {editing ? (
        <EditSheet
          target={editing}
          allCategories={categories ?? []}
          tree={tree}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function NodeRow({
  node,
  depth,
  first,
  onEdit,
  onAddChild,
  onMove,
}: {
  node: TreeNode;
  depth: number;
  first: boolean;
  onEdit: (c: Category) => void;
  onAddChild: (parentId: string) => void;
  onMove: (node: TreeNode, dir: -1 | 1) => void;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          paddingLeft: 12 + depth * 20,
          borderTop: first && depth === 0 ? "none" : "1px solid var(--border)",
          background: node.archived ? "var(--surface-2)" : "var(--surface)",
          opacity: node.archived ? 0.6 : 1,
        }}
      >
        <span
          style={{
            width: 26, height: 26, borderRadius: 6, flex: "none",
            background: node.color, color: onColor(node.color),
            fontSize: 10, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {node.code}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: depth === 0 ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.name}
          </span>
          {node.archived ? (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>archived</span>
          ) : null}
        </span>

        <div style={{ display: "flex", gap: 2, color: "var(--text-muted)" }}>
          <IconBtn label="Move up" onClick={() => onMove(node, -1)}><ChevronUp size={16} /></IconBtn>
          <IconBtn label="Move down" onClick={() => onMove(node, 1)}><ChevronDown size={16} /></IconBtn>
          {depth === 0 ? (
            <IconBtn label="Add subcategory" onClick={() => onAddChild(node.id)}><Plus size={16} /></IconBtn>
          ) : null}
          <IconBtn label="Edit" onClick={() => onEdit(node)}><Pencil size={16} /></IconBtn>
        </div>
      </div>
      {node.children.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          first={false}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onMove={onMove}
        />
      ))}
    </>
  );
}

function EditSheet({
  target,
  allCategories,
  tree,
  onClose,
}: {
  target: EditTarget;
  allCategories: Category[];
  tree: TreeNode[];
  onClose: () => void;
}) {
  const existing = target.mode === "edit" ? target.category : null;
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? PRESET_COLORS[0]);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [parentId, setParentId] = useState<string | null>(
    target.mode === "new" ? target.parentId : (existing?.parentId ?? null),
  );
  const [err, setErr] = useState<string | null>(null);

  const create = useCreateCategory();
  const update = useUpdateCategory();
  const archive = useArchiveCategory();
  const busy = create.isPending || update.isPending || archive.isPending;

  // Valid re-parent targets: top-level categories, excluding self + descendants.
  const excluded = useMemo(() => {
    if (!existing) return new Set<string>();
    const node = findNode(tree, existing.id);
    return node ? subtreeIds(node) : new Set<string>();
  }, [tree, existing]);
  const parentOptions = allCategories.filter(
    (c) => !c.parentId && !c.archived && !excluded.has(c.id),
  );

  const validHex = /^#[0-9a-fA-F]{6}$/.test(color);
  const canSave = code.trim().length > 0 && name.trim().length > 0 && validHex && !busy;

  async function save() {
    setErr(null);
    try {
      if (target.mode === "new") {
        const siblings = allCategories.filter((c) => (c.parentId ?? null) === parentId);
        const nextOrder = siblings.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
        await create.mutateAsync({
          parentId,
          code: code.trim(),
          name: name.trim(),
          color,
          description: description.trim() || null,
          sortOrder: nextOrder,
        });
      } else {
        await update.mutateAsync({
          id: existing!.id,
          body: {
            code: code.trim(),
            name: name.trim(),
            color,
            description: description.trim() || null,
            parentId,
          },
        });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the category.");
    }
  }

  async function toggleArchive() {
    setErr(null);
    try {
      if (existing!.archived) {
        await update.mutateAsync({ id: existing!.id, body: { archived: false } });
      } else {
        await archive.mutateAsync(existing!.id);
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not archive the category.");
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={overlay}>
      <div onClick={onClose} style={scrim} />
      <div style={sheet}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            {target.mode === "new" ? "New category" : "Edit category"}
          </span>
          <button aria-label="Close" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Studying" style={input} />
          </Field>

          <Field label="Code">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Fb" maxLength={10} style={{ ...input, fontFamily: "var(--font-mono, monospace)" }} />
          </Field>

          <Field label="Parent">
            <select value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)} style={input}>
              <option value="">None (top level)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Color">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 26, height: 26, borderRadius: 6, background: c, border: "none",
                    outline: color.toLowerCase() === c ? "2px solid var(--text)" : "1px solid var(--border)",
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>
            <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#3b82f6" style={{ ...input, width: 120, borderColor: validHex ? "var(--border-strong)" : "var(--danger)" }} />
          </Field>

          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...input, height: "auto", padding: 10, resize: "vertical" }} />
          </Field>

          {err ? (
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--danger)", fontSize: 13, borderRadius: 8, padding: "8px 12px" }}>
              {err}
            </div>
          ) : null}

          <button onClick={save} disabled={!canSave} style={{ ...primaryBtn, height: 44, justifyContent: "center", opacity: canSave ? 1 : 0.5 }}>
            {busy ? "Saving…" : target.mode === "new" ? "Create" : "Save changes"}
          </button>

          {existing ? (
            <button onClick={toggleArchive} disabled={busy} style={dangerBtn}>
              {existing.archived ? (<><ArchiveRestore size={16} /> Unarchive</>) : (<><Archive size={16} /> Archive</>)}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} style={{ width: 30, height: 30, borderRadius: 6, border: "none", background: "transparent", color: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500,
  color: "var(--accent-contrast)", background: "var(--accent)", border: "none",
  borderRadius: "var(--radius)", padding: "8px 14px",
};
const dangerBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44,
  color: "var(--danger)", background: "var(--surface)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)", fontSize: 14, fontWeight: 500,
};
const input: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", fontSize: 15,
  color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)", outline: "none",
};
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" };
const scrim: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" };
const sheet: React.CSSProperties = { position: "relative", background: "var(--surface)", borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "88dvh", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)" };
const closeBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--surface-2)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" };
