"use client";

import type React from "react";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Category, TimeEntry } from "@/lib/api/types";
import { onColor } from "@/lib/color";
import { hourLabel, SLOTS_PER_HOUR, slotTimeLabel } from "@/lib/slots";

interface Props {
  entriesBySlot: Map<number, TimeEntry>;
  categoriesById: Map<string, Category>;
  categories: Category[];
  currentSlot: number | null;
  conflictSlots: Set<number>;
  brushId: string | null;
  onFill: (slots: number[], categoryId: string | null) => void;
  onOpenNote: (slot: number) => void;
  onNeedBrush: () => void;
}

const clamp = (n: number) => Math.max(0, Math.min(95, n));
const rangeSlots = (a: number, b: number) =>
  Array.from({ length: Math.abs(a - b) + 1 }, (_, i) => Math.min(a, b) + i);

export function DesktopGrid({
  entriesBySlot,
  categoriesById,
  categories,
  currentSlot,
  conflictSlots,
  brushId,
  onFill,
  onOpenNote,
  onNeedBrush,
}: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<number>(currentSlot ?? 0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [buffer, setBuffer] = useState("");
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);

  const codeToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) if (!c.archived) m.set(c.code.toLowerCase(), c.id);
    return m;
  }, [categories]);

  const selection = anchor !== null ? rangeSlots(anchor, cursor) : [cursor];
  const selLo = Math.min(...selection);
  const selHi = Math.max(...selection);

  function moveCursor(delta: number, extend: boolean) {
    if (extend) {
      if (anchor === null) setAnchor(cursor);
    } else {
      setAnchor(null);
    }
    setCursor(clamp(cursor + delta));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); return moveCursor(-SLOTS_PER_HOUR, e.shiftKey);
      case "ArrowDown": e.preventDefault(); return moveCursor(SLOTS_PER_HOUR, e.shiftKey);
      case "ArrowLeft": e.preventDefault(); return moveCursor(-1, e.shiftKey);
      case "ArrowRight": e.preventDefault(); return moveCursor(1, e.shiftKey);
      case "Enter": {
        e.preventDefault();
        if (buffer) {
          const id = codeToId.get(buffer.toLowerCase());
          if (id) {
            onFill(selection, id);
            setBuffer("");
            setAnchor(null);
          }
        } else if (brushId) {
          onFill(selection, brushId);
          setAnchor(null);
        } else {
          onNeedBrush();
        }
        return;
      }
      case "Backspace":
      case "Delete":
        e.preventDefault();
        onFill(selection, null);
        setAnchor(null);
        return;
      case "Escape":
        e.preventDefault();
        setAnchor(null);
        setBuffer("");
        return;
      default:
        // Accumulate a category code (letters incl. accents). Ignore modifiers.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
          setBuffer((b) => (b + e.key).slice(0, 10));
        }
    }
  }

  function slotFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const holder = el?.closest("[data-slot]") as HTMLElement | null;
    if (!holder) return null;
    const n = Number(holder.dataset.slot);
    return Number.isNaN(n) ? null : n;
  }

  function onPointerDown(slot: number, e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    gridRef.current?.focus();
    setCursor(slot);
    setAnchor(null);
    setBuffer("");
    setDrag({ start: slot, end: slot });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const slot = slotFromPoint(e.clientX, e.clientY);
    if (slot !== null && slot !== drag.end) setDrag({ ...drag, end: slot });
  }
  function onPointerUp() {
    if (!drag) return;
    const slots = rangeSlots(drag.start, drag.end);
    setCursor(drag.end);
    setDrag(null);
    if (brushId) onFill(slots, brushId);
    else onNeedBrush();
  }

  const dragLo = drag ? Math.min(drag.start, drag.end) : -1;
  const dragHi = drag ? Math.max(drag.start, drag.end) : -2;
  const bufferMatches = buffer ? codeToId.has(buffer.toLowerCase()) : false;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 16px 16px" }}>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        aria-label="Day grid — arrow keys to move, type a code then Enter to fill"
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ outline: "none", borderRadius: 12 }}
      >
        {Array.from({ length: 24 }).map((_, hour) => (
          <div key={hour} role="row" style={{ display: "flex", alignItems: "center", gap: 8, height: 32 }}>
            <div className="tabular" style={{ width: 40, flex: "none", fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
              {hourLabel(hour)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, flex: 1 }}>
              {Array.from({ length: SLOTS_PER_HOUR }).map((__, i) => {
                const slot = hour * SLOTS_PER_HOUR + i;
                const entry = entriesBySlot.get(slot);
                const cat = entry ? categoriesById.get(entry.categoryId) : undefined;
                const fill = cat?.color;
                const isCursor = slot === cursor;
                const inSel = anchor !== null && slot >= selLo && slot <= selHi;
                const inDrag = slot >= dragLo && slot <= dragHi;
                const isCurrent = slot === currentSlot;
                const hasNote = Boolean(entry?.note);
                const isConflict = conflictSlots.has(slot);
                const ring = isCursor
                  ? "0 0 0 2px var(--accent)"
                  : inSel || inDrag
                    ? "0 0 0 2px var(--accent)"
                    : isCurrent
                      ? "inset 0 0 0 2px var(--accent)"
                      : "none";
                return (
                  <div
                    key={slot}
                    role="gridcell"
                    data-slot={slot}
                    title={`${slotTimeLabel(slot)}${cat ? ` · ${cat.name}` : ""}${entry?.note ? ` · ${entry.note}` : ""}`}
                    onPointerDown={(e) => onPointerDown(slot, e)}
                    onDoubleClick={() => onOpenNote(slot)}
                    style={{
                      position: "relative",
                      height: 28,
                      borderRadius: 5,
                      background: fill ?? "var(--surface-2)",
                      border: fill ? "none" : "1px dashed var(--border-strong)",
                      boxShadow: ring,
                      color: fill ? onColor(fill) : "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 500,
                      userSelect: "none",
                      touchAction: "none",
                      cursor: "pointer",
                    }}
                  >
                    {cat?.code ?? ""}
                    {hasNote ? (
                      <span aria-hidden style={{ position: "absolute", top: 3, right: 3, width: 4, height: 4, borderRadius: "50%", background: fill ? onColor(fill) : "var(--text-muted)", opacity: 0.8 }} />
                    ) : null}
                    {isConflict ? (
                      <span aria-hidden style={{ position: "absolute", top: 1, left: 1, width: 12, height: 12, borderRadius: "50%", background: "rgba(255,255,255,0.9)", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <AlertTriangle size={9} />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
        <span>
          Cursor <span className="tabular" style={{ color: "var(--text-secondary)" }}>{slotTimeLabel(cursor)}</span>
        </span>
        {buffer ? (
          <span style={{ color: bufferMatches ? "var(--success)" : "var(--danger)", fontWeight: 500 }}>
            code: {buffer}{bufferMatches ? " ✓ Enter to fill" : " — no match"}
          </span>
        ) : (
          <span>Type a code + Enter · arrows move · shift+arrows select · ⌫ clear · double-click for note</span>
        )}
      </div>
    </div>
  );
}
