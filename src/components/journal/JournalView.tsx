"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { CloudOff, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useCategories, useEntries, useProfile } from "@/lib/client/hooks";
import { useSync } from "@/lib/client/sync";
import type { Category, TimeEntry } from "@/lib/api/types";
import { addDays, currentDayAndSlot, prettyDay, SLOTS_PER_DAY } from "@/lib/slots";
import { BrushBar } from "./BrushBar";
import { CategorySheet } from "./CategorySheet";
import { Timeline } from "./Timeline";

export function JournalView() {
  const { data: profile } = useProfile();
  const timezone = profile?.timezone ?? "Asia/Kolkata";

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Everything below depends on the current time/date, which differs between
  // the server render and the browser. Render nothing until mounted so the
  // server and first client render agree (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const today = currentDayAndSlot(timezone, now);
  const [day, setDay] = useState<string | null>(null);
  // Land on "today" (in the user's tz) once the profile timezone is known.
  useEffect(() => {
    setDay((d) => d ?? today.day);
  }, [today.day]);

  const activeDay = day ?? today.day;
  const currentSlot = activeDay === today.day ? today.slot : null;

  const { data: categories } = useCategories();
  const { data: entries, isLoading } = useEntries(activeDay);
  const { enqueue, online, pendingCount, syncing } = useSync();

  const [brushId, setBrushId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const categoriesById = useMemo(
    () => new Map<string, Category>((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );
  const entriesBySlot = useMemo(
    () => new Map<number, TimeEntry>((entries ?? []).map((e) => [e.slot, e])),
    [entries],
  );

  const brush = brushId ? categoriesById.get(brushId) ?? null : null;
  const loggedCount = entries?.length ?? 0;

  // Recent brushes: categories used most on this day, else the first few.
  const recent = useMemo(() => {
    const freq = new Map<string, number>();
    for (const e of entries ?? []) freq.set(e.categoryId, (freq.get(e.categoryId) ?? 0) + 1);
    const used = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => categoriesById.get(id))
      .filter((c): c is Category => Boolean(c && !c.archived));
    const fill = (categories ?? []).filter((c) => !c.archived && !freq.has(c.id));
    return [...used, ...fill].slice(0, 4);
  }, [entries, categories, categoriesById]);

  function paint(slot: number) {
    if (!brushId) {
      setSheetOpen(true);
      return;
    }
    const existing = entriesBySlot.get(slot);
    const clear = existing?.categoryId === brushId;
    void enqueue(activeDay, [{ slot, categoryId: clear ? null : brushId }]);
  }

  function paintRange(slots: number[]) {
    if (!brushId || slots.length === 0) return;
    void enqueue(
      activeDay,
      slots.map((slot) => ({ slot, categoryId: brushId })),
    );
  }

  if (!mounted) {
    return <div style={{ minHeight: "100dvh" }} aria-hidden />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg)",
          padding: "14px 16px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 500 }}>
            {activeDay === today.day ? "Today" : prettyDay(activeDay)}
          </div>
          <div className="tabular" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {prettyDay(activeDay)} · {loggedCount} of {SLOTS_PER_DAY} logged
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} />
          <IconBtn label="Previous day" onClick={() => setDay(addDays(activeDay, -1))}>
            <ChevronLeft size={18} />
          </IconBtn>
          <IconBtn label="Next day" onClick={() => setDay(addDays(activeDay, 1))}>
            <ChevronRight size={18} />
          </IconBtn>
        </div>
      </header>

      <div style={{ flex: 1, paddingBottom: 104 }}>
        {isLoading ? (
          <TimelineSkeleton />
        ) : (
          <Timeline
            entriesBySlot={entriesBySlot}
            categoriesById={categoriesById}
            currentSlot={currentSlot}
            onPaint={paint}
            onPaintRange={paintRange}
          />
        )}
      </div>

      <BrushBar
        brush={brush}
        recent={recent}
        onPickRecent={setBrushId}
        onOpenPalette={() => setSheetOpen(true)}
      />

      <CategorySheet
        open={sheetOpen}
        categories={categories ?? []}
        selectedId={brushId}
        onSelect={(id) => {
          setBrushId(id);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function SyncStatus({
  online,
  pendingCount,
  syncing,
}: {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
}) {
  if (online && pendingCount === 0 && !syncing) return null;

  const offline = !online;
  const label = offline
    ? `Offline${pendingCount ? ` · ${pendingCount}` : ""}`
    : syncing
      ? "Syncing…"
      : `${pendingCount} pending`;

  return (
    <span
      title={offline ? "You're offline — changes are saved and will sync when you reconnect." : "Saving your changes"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 8px",
        borderRadius: 20,
        background: offline ? "var(--surface-2)" : "var(--surface-2)",
        color: offline ? "var(--warning)" : "var(--text-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {offline ? (
        <CloudOff size={12} />
      ) : (
        <RefreshCw size={12} className={syncing ? "tj-spin" : undefined} />
      )}
      {label}
    </span>
  );
}

function TimelineSkeleton() {
  return (
    <div style={{ padding: 12 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 48,
            margin: "6px 0",
            borderRadius: 8,
            background: "var(--surface-2)",
            opacity: 1 - i * 0.08,
          }}
        />
      ))}
    </div>
  );
}
