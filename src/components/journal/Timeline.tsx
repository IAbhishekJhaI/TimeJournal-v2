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
/** Touch: hold this long without moving to take the gesture over for range-select. */
const HOLD_MS = 350;
/** Touch travel (px) before we concede the gesture to the browser as a scroll. */
const MOVE_TOLERANCE = 8;
/** How long the anchor slot pulses when range mode engages. */
const CUE_MS = 220;

/**
 * One in-flight pointer gesture.
 *
 * Touch starts passive: the page scrolls normally and we only claim the
 * gesture once the finger has stayed put for HOLD_MS. Mouse/pen keep the
 * original behaviour (drag-select from pointerdown) since they never scroll
 * by dragging.
 */
type Gesture = {
  pointerId: number;
  touch: boolean;
  index: number;
  x: number;
  y: number;
  /** We own the gesture and are painting a range. */
  ranging: boolean;
  /** The range moved off the anchor slot at least once. */
  moved: boolean;
  /** Conceded to the browser (a scroll); ignore everything until release. */
  dead: boolean;
};

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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const [cueIndex, setCueIndex] = useState<number | null>(null);
  const centered = useRef(false);
  const timer = useRef<number | null>(null);
  const cueTimer = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    if (!centered.current && currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center" });
      centered.current = true;
    }
  }, []);

  /**
   * Suppress scrolling once range mode is live. `touch-action` is latched by
   * the browser at gesture start so it can't be flipped mid-gesture, and
   * React's onTouchMove is passive — hence a manual non-passive listener.
   */
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (gesture.current?.ranging) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (cueTimer.current !== null) clearTimeout(cueTimer.current);
    },
    [],
  );

  function clearTimer() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function endGesture() {
    clearTimer();
    gesture.current = null;
    setDrag(null);
  }

  function pulse(index: number) {
    setCueIndex(index);
    if (cueTimer.current !== null) clearTimeout(cueTimer.current);
    cueTimer.current = window.setTimeout(() => setCueIndex(null), CUE_MS);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        /* not supported / blocked — the visual pulse still fires */
      }
    }
  }

  function indexFromPoint(x: number, y: number): number | null {
    // Ignore drags that wander outside the grid's horizontal band, so a
    // sideways fling doesn't keep extending the selection to the row edge.
    const rect = gridRef.current?.getBoundingClientRect();
    if (rect && (x < rect.left || x > rect.right)) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const holder = el?.closest("[data-index]") as HTMLElement | null;
    if (!holder) return null;
    const n = Number(holder.dataset.index);
    return Number.isNaN(n) ? null : n;
  }

  function capture(pointerId: number) {
    try {
      gridRef.current?.setPointerCapture?.(pointerId);
    } catch {
      /* capture is best-effort; hit-testing works without it */
    }
  }

  function onPointerDown(index: number, e: React.PointerEvent) {
    const touch = e.pointerType === "touch";
    longPressed.current = false;
    clearTimer();
    gesture.current = {
      pointerId: e.pointerId,
      touch,
      index,
      x: e.clientX,
      y: e.clientY,
      ranging: !touch,
      moved: false,
      dead: false,
    };

    if (!touch) {
      // Mouse / pen: select immediately, and hold still to open the note sheet.
      capture(e.pointerId);
      setDrag({ start: index, end: index });
      timer.current = window.setTimeout(() => {
        longPressed.current = true;
        endGesture();
        onLongPress(index);
      }, LONG_PRESS_MS);
      return;
    }

    // Touch: stay passive so the page can scroll. Claim it only after a hold.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const g = gesture.current;
      if (!g || g.dead || g.pointerId !== e.pointerId) return;
      g.ranging = true;
      capture(g.pointerId);
      setDrag({ start: g.index, end: g.index });
      pulse(g.index);
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.dead || g.pointerId !== e.pointerId) return;

    if (!g.ranging) {
      // Still deciding. Enough travel means the user is scrolling, not holding.
      const far =
        Math.abs(e.clientX - g.x) > MOVE_TOLERANCE ||
        Math.abs(e.clientY - g.y) > MOVE_TOLERANCE;
      if (far) {
        clearTimer();
        g.dead = true;
        setDrag(null);
      }
      return;
    }

    if (!drag) return;
    const index = indexFromPoint(e.clientX, e.clientY);
    if (index !== null && index !== drag.end) {
      clearTimer();
      g.moved = true;
      setDrag({ ...drag, end: index });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    clearTimer();
    gesture.current = null;

    if (longPressed.current) {
      longPressed.current = false;
      setDrag(null);
      return;
    }
    if (!g || g.dead || g.pointerId !== e.pointerId) {
      setDrag(null);
      return;
    }

    // Touch that never reached the hold: a plain tap on one slot.
    if (g.touch && !g.ranging) {
      setDrag(null);
      onPickFor([g.index], { x: e.clientX, y: e.clientY });
      return;
    }

    // Held without dragging: open the note sheet for that slot.
    if (g.touch && !g.moved) {
      setDrag(null);
      onLongPress(g.index);
      return;
    }

    if (!drag) return;
    const lo = Math.min(drag.start, drag.end);
    const hi = Math.max(drag.start, drag.end);
    const indices = lo === hi ? [lo] : Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    setDrag(null);
    onPickFor(indices, { x: e.clientX, y: e.clientY });
  }

  function onPointerCancel() {
    longPressed.current = false;
    endGesture();
  }

  const pendingLo = drag ? Math.min(drag.start, drag.end) : -1;
  const pendingHi = drag ? Math.max(drag.start, drag.end) : -2;

  return (
    <div
      ref={gridRef}
      style={{ padding: "8px 12px 16px" }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
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
              const isCue = index === cueIndex;
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
                    boxShadow:
                      isCue
                        ? "0 0 0 3px var(--accent)"
                        : isCurrent || isPending
                          ? "0 0 0 2px var(--accent)"
                          : "none",
                    color: fill ? onColor(fill) : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 500,
                    userSelect: "none",
                    // Vertical scrolling stays with the browser; range mode
                    // suppresses it via the non-passive touchmove listener.
                    touchAction: "pan-y",
                    transform: isCue ? "scale(0.94)" : "none",
                    transition: "background 120ms ease-out, transform 120ms ease-out",
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
