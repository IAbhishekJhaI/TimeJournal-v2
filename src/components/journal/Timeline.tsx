"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { Category, TimeEntry } from "@/lib/api/types";
import { onColor } from "@/lib/color";
import { hourLabel, SLOTS_PER_HOUR } from "@/lib/slots";

interface Props {
  entriesBySlot: Map<number, TimeEntry>;
  categoriesById: Map<string, Category>;
  currentSlot: number | null;
  onPaint: (slot: number) => void;
  onPaintRange: (slots: number[]) => void;
}

export function Timeline({
  entriesBySlot,
  categoriesById,
  currentSlot,
  onPaint,
  onPaintRange,
}: Props) {
  const currentRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const centered = useRef(false);

  useEffect(() => {
    if (!centered.current && currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center" });
      centered.current = true;
    }
  }, []);

  function slotFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const holder = el?.closest("[data-slot]") as HTMLElement | null;
    if (!holder) return null;
    const n = Number(holder.dataset.slot);
    return Number.isNaN(n) ? null : n;
  }

  function onPointerDown(slot: number, e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ start: slot, end: slot });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const slot = slotFromPoint(e.clientX, e.clientY);
    if (slot !== null && slot !== drag.end) setDrag({ ...drag, end: slot });
  }
  function onPointerUp() {
    if (!drag) return;
    const lo = Math.min(drag.start, drag.end);
    const hi = Math.max(drag.start, drag.end);
    if (lo === hi) {
      onPaint(lo);
    } else {
      onPaintRange(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
    }
    setDrag(null);
  }

  const pendingLo = drag ? Math.min(drag.start, drag.end) : -1;
  const pendingHi = drag ? Math.max(drag.start, drag.end) : -2;

  return (
    <div style={{ padding: "8px 12px 16px" }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {Array.from({ length: 24 }).map((_, hour) => (
        <div key={hour} style={{ display: "flex", alignItems: "center", gap: 8, height: 56 }}>
          <div
            className="tabular"
            style={{ width: 34, flex: "none", fontSize: 10, color: "var(--text-muted)", textAlign: "right" }}
          >
            {hourLabel(hour)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, flex: 1 }}>
            {Array.from({ length: SLOTS_PER_HOUR }).map((__, i) => {
              const slot = hour * SLOTS_PER_HOUR + i;
              const entry = entriesBySlot.get(slot);
              const cat = entry ? categoriesById.get(entry.categoryId) : undefined;
              const isCurrent = slot === currentSlot;
              const isPending = slot >= pendingLo && slot <= pendingHi;
              const fill = cat?.color;
              return (
                <div
                  key={slot}
                  ref={isCurrent ? currentRef : undefined}
                  data-slot={slot}
                  role="button"
                  aria-label={`slot ${slot}${cat ? `, ${cat.name}` : ", empty"}`}
                  onPointerDown={(e) => onPointerDown(slot, e)}
                  style={{
                    height: 48,
                    borderRadius: 8,
                    background: fill ?? "var(--surface-2)",
                    border: fill ? "none" : "1px dashed var(--border-strong)",
                    boxShadow: isCurrent
                      ? "0 0 0 2px var(--accent)"
                      : isPending
                        ? "0 0 0 2px var(--accent)"
                        : "none",
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
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
