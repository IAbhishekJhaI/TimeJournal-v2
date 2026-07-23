"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Category, TimeEntry } from "@/lib/api/types";
import { onColor } from "@/lib/color";
import { hourLabel, SLOTS_PER_HOUR } from "@/lib/slots";
import { cellKey, type Cell } from "@/lib/journalWindow";

interface Props {
  cells: Cell[]; // 96, display order
  entriesByKey: Map<string, TimeEntry>;
  categoriesById: Map<string, Category>;
  currentIndex: number | null;
  conflictKeys: Set<string>;
  onPickFor: (indices: number[], anchor: { x: number; y: number }) => void;
  onLongPress: (index: number) => void;
}

const LONG_PRESS_MS = 450;

export function Timeline({
  cells,
  entriesByKey,
  categoriesById,
  currentIndex,
  conflictKeys,
  onPickFor,
  onLongPress,
}: Props) {
  const currentRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const centered = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    if (!centered.current && currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center" });
      centered.current = true;
    }
  }, []);

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function indexFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const holder = el?.closest("[data-index]") as HTMLElement | null;
    if (!holder) return null;
    const n = Number(holder.dataset.index);
    return Number.isNaN(n) ? null : n;
  }

  function onPointerDown(index: number, e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    longPressed.current = false;
    setDrag({ start: index, end: index });
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setDrag(null);
      onLongPress(index);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const index = indexFromPoint(e.clientX, e.clientY);
    if (index !== null && index !== drag.end) {
      clearLongPress();
      setDrag({ ...drag, end: index });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    clearLongPress();
    if (longPressed.current) {
      longPressed.current = false;
      setDrag(null);
      return;
    }
    if (!drag) return;
    const lo = Math.min(drag.start, drag.end);
    const hi = Math.max(drag.start, drag.end);
    const indices = lo === hi ? [lo] : Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    setDrag(null);
    onPickFor(indices, { x: e.clientX, y: e.clientY });
  }

  const pendingLo = drag ? Math.min(drag.start, drag.end) : -1;
  const pendingHi = drag ? Math.max(drag.start, drag.end) : -2;

  return (
    <div style={{ padding: "8px 12px 16px" }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {Array.from({ length: 24 }).map((_, row) => (
        <div key={row} style={{ display: "flex", alignItems: "center", gap: 8, height: 56 }}>
          <div
            className="tabular"
            style={{ width: 34, flex: "none", fontSize: 10, color: "var(--text-muted)", textAlign: "right" }}
          >
            {hourLabel(cells[row * SLOTS_PER_HOUR].hour)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, flex: 1 }}>
            {Array.from({ length: SLOTS_PER_HOUR }).map((__, c) => {
              const index = row * SLOTS_PER_HOUR + c;
              const cell = cells[index];
              const entry = entriesByKey.get(cellKey(cell.day, cell.slot));
              const cat = entry ? categoriesById.get(entry.categoryId) : undefined;
              const isCurrent = index === currentIndex;
              const isPending = index >= pendingLo && index <= pendingHi;
              const fill = cat?.color;
              const hasNote = Boolean(entry?.note);
              const isConflict = conflictKeys.has(cellKey(cell.day, cell.slot));
              return (
                <div
                  key={index}
                  ref={isCurrent ? currentRef : undefined}
                  data-index={index}
                  role="button"
                  aria-label={`${cell.day} slot ${cell.slot}${cat ? `, ${cat.name}` : ", empty"}${hasNote ? ", has note" : ""}${isConflict ? ", changed on another device" : ""}`}
                  onPointerDown={(e) => onPointerDown(index, e)}
                  style={{
                    position: "relative",
                    height: 48,
                    borderRadius: 8,
                    background: fill ?? "var(--surface-2)",
                    border: fill ? "none" : "1px dashed var(--border-strong)",
                    boxShadow: isCurrent || isPending ? "0 0 0 2px var(--accent)" : "none",
                    color: fill ? onColor(fill) : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 500,
                    userSelect: "none",
                    touchAction: "none",
                    transition: "background 120ms ease-out",
                  }}
                >
                  {cat?.code ?? ""}
                  {hasNote ? (
                    <span aria-hidden style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: fill ? onColor(fill) : "var(--text-muted)", opacity: 0.8 }} />
                  ) : null}
                  {isConflict ? (
                    <span aria-hidden style={{ position: "absolute", top: 2, left: 2, width: 15, height: 15, borderRadius: "50%", background: "rgba(255,255,255,0.9)", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <AlertTriangle size={10} />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
