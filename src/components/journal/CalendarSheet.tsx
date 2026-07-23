"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { SLOTS_PER_DAY } from "@/lib/slots";

interface Props {
  selectedDay: string;
  today: string;
  onSelect: (day: string) => void;
  onClose: () => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
const dayStr = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function CalendarSheet({ selectedDay, today, onSelect, onClose }: Props) {
  const [year, setYear] = useState(() => Number(selectedDay.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(selectedDay.slice(5, 7)) - 1); // 0-based

  const from = dayStr(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const to = dayStr(year, month, daysInMonth);

  const { data: entries } = useQuery({
    queryKey: ["month-entries", from, to],
    queryFn: () => api.getEntries(from, to),
  });

  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries ?? []) m.set(e.day, (m.get(e.day) ?? 0) + 1);
    return m;
  }, [entries]);

  // Mon-first leading blanks.
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun
  const leading = (firstDow + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Pick a day" style={overlay}>
      <div onClick={onClose} style={scrim} />
      <div style={sheet}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{MONTHS[month]} {year}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <IconBtn label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></IconBtn>
            <IconBtn label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></IconBtn>
            <button aria-label="Close" onClick={onClose} style={closeBtn}><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: "0 16px 8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>{w}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const ds = dayStr(year, month, d);
              const count = countByDay.get(ds) ?? 0;
              const isSelected = ds === selectedDay;
              const isToday = ds === today;
              const isFuture = ds > today;
              const intensity = Math.min(1, count / (SLOTS_PER_DAY * 0.5));
              return (
                <button
                  key={i}
                  onClick={() => { onSelect(ds); onClose(); }}
                  aria-label={`${ds}, ${count} of ${SLOTS_PER_DAY} logged`}
                  aria-current={isToday ? "date" : undefined}
                  style={{
                    position: "relative",
                    aspectRatio: "1 / 1",
                    borderRadius: 8,
                    border: isToday ? "1px solid var(--accent)" : "1px solid transparent",
                    background: isSelected ? "var(--accent)" : "var(--surface-2)",
                    color: isSelected ? "var(--accent-contrast)" : isFuture ? "var(--text-muted)" : "var(--text)",
                    fontSize: 13,
                    fontWeight: isSelected || isToday ? 500 : 400,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {d}
                  {count > 0 ? (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: isSelected ? "var(--accent-contrast)" : "var(--accent)",
                        opacity: isSelected ? 0.9 : 0.35 + intensity * 0.65,
                      }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "4px 16px 16px", display: "flex", justifyContent: "center" }}>
          <button
            onClick={() => { onSelect(today); onClose(); }}
            style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", background: "none", border: "none", padding: 8 }}
          >
            Jump to today
          </button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" };
const scrim: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" };
const sheet: React.CSSProperties = { position: "relative", background: "var(--surface)", borderTopLeftRadius: 16, borderTopRightRadius: 16, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: "env(safe-area-inset-bottom)" };
const closeBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: "50%", border: "none", background: "var(--surface-2)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" };
