"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Category, TimeEntry } from "@/lib/api/types";
import { onColor } from "@/lib/color";
import { hourLabel, SLOTS_PER_HOUR, slotTimeLabel } from "@/lib/slots";
import { cellKey, type Cell } from "@/lib/journalWindow";
import type { Brush } from "./DesktopPalette";

interface Props {
  cells: Cell[];
  entriesByKey: Map<string, TimeEntry>;
  categoriesById: Map<string, Category>;
  categories: Category[];
  currentIndex: number | null;
  conflictKeys: Set<string>;
  brush: Brush; // current palette brush (kept in sync with typed codes)
  onSetBrush: (brush: Brush) => void;
  onFill: (indices: number[], categoryId: string | null) => void; // keyboard direct-fill
  onPickFor: (indices: number[], anchor: { x: number; y: number }) => void; // pointer / no-code
  onOpenNote: (index: number) => void;
}

const clamp = (n: number) => Math.max(0, Math.min(95, n));
const rangeIdx = (a: number, b: number) =>
  Array.from({ length: Math.abs(a - b) + 1 }, (_, i) => Math.min(a, b) + i);

export function DesktopGrid({
  cells,
  entriesByKey,
  categoriesById,
  categories,
  currentIndex,
  conflictKeys,
  brush,
  onSetBrush,
  onFill,
  onPickFor,
  onOpenNote,
}: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<number>(currentIndex ?? 0);
  // No slot is selected until the user chooses one (click, or first arrow key).
  // Until then the cursor ring is hidden and the grid doesn't auto-scroll.
  const [interacted, setInteracted] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [buffer, setBuffer] = useState("");
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);

  const codeToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) if (!c.archived) m.set(c.code.toLowerCase(), c.id);
    return m;
  }, [categories]);

  const selection = anchor !== null ? rangeIdx(anchor, cursor) : [cursor];
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

  // Resolve the current palette brush to a paintable target. "erase" paints
  // null (clears); a valid category id paints that category; anything else
  // (no brush chosen) is not paintable, so shift+arrow falls back to selecting.
  const brushCat = brush && brush !== "erase" ? categoriesById.get(brush) : undefined;
  const brushPaintable = brush === "erase" || Boolean(brushCat);
  const brushFillId = brush === "erase" ? null : brushCat ? (brush as string) : null;

  /** Shift+arrow: fill every slot traversed on this step with the brush. */
  function shiftMove(delta: number) {
    if (!brushPaintable) {
      moveCursor(delta, true); // no brush yet — just extend the selection
      return;
    }
    if (anchor === null) setAnchor(cursor);
    const next = clamp(cursor + delta);
    onFill(rangeIdx(cursor, next), brushFillId);
    setCursor(next);
  }

  // Keep the cursor slot in view as it moves, and reveal one row below it.
  // Only once the user has actually chosen a slot — never auto-scroll on load.
  useEffect(() => {
    if (!interacted) return;
    const grid = gridRef.current;
    if (!grid) return;
    const cur = grid.querySelector(`[data-index="${cursor}"]`) as HTMLElement | null;
    const below = grid.querySelector(
      `[data-index="${clamp(cursor + SLOTS_PER_HOUR)}"]`,
    ) as HTMLElement | null;
    cur?.scrollIntoView({ block: "nearest" });
    below?.scrollIntoView({ block: "nearest" });
  }, [cursor, interacted]);

  function onKeyDown(e: React.KeyboardEvent) {
    const isArrow =
      e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    // Nothing is selected yet: the first arrow key just reveals the cursor at
    // the current time slot (without moving); other keys are ignored until the
    // user has picked a slot to work from.
    if (!interacted) {
      if (isArrow) {
        e.preventDefault();
        setInteracted(true);
        setCursor(currentIndex ?? 0);
      }
      return;
    }
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); return e.shiftKey ? shiftMove(-SLOTS_PER_HOUR) : moveCursor(-SLOTS_PER_HOUR, false);
      case "ArrowDown": e.preventDefault(); return e.shiftKey ? shiftMove(SLOTS_PER_HOUR) : moveCursor(SLOTS_PER_HOUR, false);
      case "ArrowLeft": e.preventDefault(); return e.shiftKey ? shiftMove(-1) : moveCursor(-1, false);
      case "ArrowRight": e.preventDefault(); return e.shiftKey ? shiftMove(1) : moveCursor(1, false);
      case "Enter": {
        e.preventDefault();
        if (buffer) {
          const id = codeToId.get(buffer.toLowerCase());
          // Fill the selection AND adopt this category as the palette brush, so
          // a following shift+arrow paints neighbours with the same code.
          if (id) { onFill(selection, id); onSetBrush(id); setBuffer(""); setAnchor(null); }
        } else {
          onPickFor(selection, anchorForIndex(cursor));
          setAnchor(null);
        }
        return;
      }
      case "Backspace":
      case "Delete":
        e.preventDefault();
        // While typing a code, backspace edits the buffer instead of clearing
        // the slot. With no buffer, it clears the selected slot(s).
        if (buffer) {
          setBuffer((b) => b.slice(0, -1));
        } else {
          onFill(selection, null);
          setAnchor(null);
        }
        return;
      case "Escape":
        e.preventDefault();
        // Cancel an in-progress code first; a second Escape drops the selection.
        if (buffer) setBuffer("");
        else setAnchor(null);
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
          setBuffer((b) => (b + e.key).slice(0, 10));
        }
    }
  }

  function indexFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const holder = el?.closest("[data-index]") as HTMLElement | null;
    if (!holder) return null;
    const n = Number(holder.dataset.index);
    return Number.isNaN(n) ? null : n;
  }

  function anchorForIndex(index: number): { x: number; y: number } {
    const el = gridRef.current?.querySelector(`[data-index="${index}"]`) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return r
      ? { x: r.left + r.width / 2, y: r.bottom }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function onPointerDown(index: number, e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    gridRef.current?.focus();
    setInteracted(true); // clicking a slot chooses it as the cursor
    setCursor(index);
    setAnchor(null);
    setBuffer("");
    setDrag({ start: index, end: index });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const index = indexFromPoint(e.clientX, e.clientY);
    if (index !== null && index !== drag.end) setDrag({ ...drag, end: index });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const indices = rangeIdx(drag.start, drag.end);
    setCursor(drag.end);
    setDrag(null);
    onPickFor(indices, { x: e.clientX, y: e.clientY });
  }

  const dragLo = drag ? Math.min(drag.start, drag.end) : -1;
  const dragHi = drag ? Math.max(drag.start, drag.end) : -2;
  const bufferMatches = buffer ? codeToId.has(buffer.toLowerCase()) : false;
  const cursorCell = cells[cursor];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 16px 16px" }}>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        aria-label="Day grid — arrow keys to move, type a code then Enter to fill, hold shift and arrow to batch-fill with the current brush"
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ outline: "none", borderRadius: 12 }}
      >
        {Array.from({ length: 24 }).map((_, row) => (
          <div key={row} role="row" style={{ display: "flex", alignItems: "center", gap: 8, height: 32 }}>
            <div className="tabular" style={{ width: 40, flex: "none", fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
              {hourLabel(cells[row * SLOTS_PER_HOUR].hour)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, flex: 1 }}>
              {Array.from({ length: SLOTS_PER_HOUR }).map((__, c) => {
                const index = row * SLOTS_PER_HOUR + c;
                const cell = cells[index];
                const entry = entriesByKey.get(cellKey(cell.day, cell.slot));
                const cat = entry ? categoriesById.get(entry.categoryId) : undefined;
                const fill = cat?.color;
                const isCursor = interacted && index === cursor;
                const inSel = anchor !== null && index >= selLo && index <= selHi;
                const inDrag = index >= dragLo && index <= dragHi;
                const isCurrent = index === currentIndex;
                const hasNote = Boolean(entry?.note);
                const isConflict = conflictKeys.has(cellKey(cell.day, cell.slot));
                const ring = isCursor || inSel || inDrag
                  ? "0 0 0 2px var(--accent)"
                  : isCurrent
                    ? "inset 0 0 0 2px var(--accent)"
                    : "none";
                return (
                  <div
                    key={index}
                    role="gridcell"
                    data-index={index}
                    title={`${slotTimeLabel(cell.slot)}${cat ? ` · ${cat.name}` : ""}${entry?.note ? ` · ${entry.note}` : ""}`}
                    onPointerDown={(e) => onPointerDown(index, e)}
                    onDoubleClick={() => onOpenNote(index)}
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
          {interacted ? (
            <>Cursor <span className="tabular" style={{ color: "var(--text-secondary)" }}>{slotTimeLabel(cursorCell.slot)}</span></>
          ) : (
            "Click a slot to start"
          )}
        </span>
        {buffer ? (
          <span style={{ color: bufferMatches ? "var(--success)" : "var(--danger)", fontWeight: 500 }}>
            code: {buffer}{bufferMatches ? " ✓ Enter to fill" : " — no match"}
          </span>
        ) : (
          <span>Type a code + Enter · arrows move · shift+arrows batch-fill · ⌫ delete code / clear slot · Esc cancel · double-click for note</span>
        )}
      </div>
    </div>
  );
}
