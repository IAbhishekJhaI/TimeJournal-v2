"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, CloudOff, RefreshCw, Redo2, Undo2 } from "lucide-react";
import { useCategories, useEntries, useProfile } from "@/lib/client/hooks";
import { useSync } from "@/lib/client/sync";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import type { Category, TimeEntry } from "@/lib/api/types";
import { currentDayAndSlot, prettyDay, SLOTS_PER_DAY } from "@/lib/slots";
import { BrushBar } from "./BrushBar";
import { CalendarSheet } from "./CalendarSheet";
import { CategorySheet } from "./CategorySheet";
import { DesktopGrid } from "./DesktopGrid";
import { SlotSheet } from "./SlotSheet";
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
  const { enqueue, online, pendingCount, syncing, conflicts, clearConflict, clearConflicts } =
    useSync();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [brushId, setBrushId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [noteSlot, setNoteSlot] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Undo/redo for this day. Each action records the slots' state BEFORE (for
  // undo) and the writes it applied AFTER (for redo); both replay through the
  // queue. Stacks reset when the viewed day changes.
  type SlotSnapshot = { slot: number; prev: { categoryId: string; note: string | null } | null };
  type WriteItem = { slot: number; categoryId: string | null; note: string | null };
  type Action = { before: SlotSnapshot[]; after: WriteItem[] };
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);

  const categoriesById = useMemo(
    () => new Map<string, Category>((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );
  const entriesBySlot = useMemo(
    () => new Map<number, TimeEntry>((entries ?? []).map((e) => [e.slot, e])),
    [entries],
  );

  const conflictSlots = useMemo(
    () => new Set(conflicts.filter((c) => c.day === activeDay).map((c) => c.slot)),
    [conflicts, activeDay],
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

  const baselineOf = (slot: number) => entriesBySlot.get(slot)?.updatedAt ?? null;

  // Reset undo/redo history when the viewed day changes (snapshots are per-day).
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [activeDay]);

  /** Replay a set of writes through the queue (clearing any conflict flags). */
  function applyWrites(items: WriteItem[]) {
    items.forEach((i) => clearConflict(activeDay, i.slot));
    void enqueue(
      activeDay,
      items.map((i) => ({ ...i, clientUpdatedAt: baselineOf(i.slot) })),
    );
  }

  /** The single write path: record before/after for undo/redo, then apply. */
  function commit(items: { slot: number; categoryId: string | null; note?: string | null }[]) {
    if (items.length === 0) return;
    const before: SlotSnapshot[] = items.map((i) => {
      const e = entriesBySlot.get(i.slot);
      return { slot: i.slot, prev: e ? { categoryId: e.categoryId, note: e.note } : null };
    });
    const after: WriteItem[] = items.map((i) => ({
      slot: i.slot,
      categoryId: i.categoryId,
      note: i.note ?? null,
    }));
    setUndoStack((s) => [...s, { before, after }].slice(-100));
    setRedoStack([]); // a fresh action invalidates the redo branch
    applyWrites(after);
  }

  function undo() {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, action].slice(-100));
    applyWrites(
      action.before.map((b) => ({
        slot: b.slot,
        categoryId: b.prev ? b.prev.categoryId : null,
        note: b.prev ? b.prev.note : null,
      })),
    );
  }

  function redo() {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, action].slice(-100));
    applyWrites(action.after);
  }

  // Keep refs so the one-time keyboard listener always calls the latest fns.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Don't hijack native text-undo while typing (e.g. the note field).
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && e.shiftKey) {
        e.preventDefault();
        redoRef.current();
      } else if (mod && key === "z") {
        e.preventDefault();
        undoRef.current();
      } else if (mod && key === "y") {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function paint(slot: number) {
    if (!brushId) {
      setSheetOpen(true);
      return;
    }
    const existing = entriesBySlot.get(slot);
    const clear = existing?.categoryId === brushId;
    commit([{ slot, categoryId: clear ? null : brushId }]);
  }

  function paintRange(slots: number[]) {
    if (!brushId || slots.length === 0) return;
    commit(slots.map((slot) => ({ slot, categoryId: brushId })));
  }

  function fill(slots: number[], categoryId: string | null) {
    commit(slots.map((slot) => ({ slot, categoryId })));
  }

  const noteEntry = noteSlot !== null ? entriesBySlot.get(noteSlot) : undefined;
  const prevEntry =
    noteSlot !== null && noteSlot > 0 ? entriesBySlot.get(noteSlot - 1) : undefined;

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
        <button
          onClick={() => setCalendarOpen(true)}
          aria-label="Open calendar to change day"
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, textAlign: "left" }}
        >
          <CalendarDays size={20} style={{ color: "var(--text-secondary)", flex: "none" }} />
          <span>
            <span style={{ display: "block", fontSize: 17, fontWeight: 500, color: "var(--text)" }}>
              {activeDay === today.day ? "Today" : prettyDay(activeDay)}
            </span>
            <span className="tabular" style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
              {prettyDay(activeDay)} · {loggedCount} of {SLOTS_PER_DAY} logged
            </span>
          </span>
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} />
          {undoStack.length > 0 ? (
            <IconBtn label="Undo last change" onClick={undo}>
              <Undo2 size={17} />
            </IconBtn>
          ) : null}
          {redoStack.length > 0 ? (
            <IconBtn label="Redo" onClick={redo}>
              <Redo2 size={17} />
            </IconBtn>
          ) : null}
        </div>
      </header>

      <div aria-live="polite" className="sr-only">
        {conflictSlots.size > 0
          ? `${conflictSlots.size} slot${conflictSlots.size === 1 ? "" : "s"} on this day changed on another device.`
          : ""}
      </div>

      {conflictSlots.size > 0 ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "8px 12px 0",
            padding: "8px 12px",
            fontSize: 13,
            borderRadius: 8,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--warning)",
          }}
        >
          <AlertTriangle size={15} />
          <span style={{ flex: 1, color: "var(--text-secondary)" }}>
            {conflictSlots.size} slot{conflictSlots.size === 1 ? "" : "s"} changed on another device — your version was kept.
          </span>
          <button
            onClick={() => clearConflicts()}
            style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)", background: "none", border: "none" }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div style={{ flex: 1, paddingBottom: 104 }}>
        {isLoading ? (
          <TimelineSkeleton />
        ) : isDesktop ? (
          <DesktopGrid
            entriesBySlot={entriesBySlot}
            categoriesById={categoriesById}
            categories={categories ?? []}
            currentSlot={currentSlot}
            conflictSlots={conflictSlots}
            brushId={brushId}
            onFill={fill}
            onOpenNote={(slot) => setNoteSlot(slot)}
            onNeedBrush={() => setSheetOpen(true)}
          />
        ) : (
          <Timeline
            entriesBySlot={entriesBySlot}
            categoriesById={categoriesById}
            currentSlot={currentSlot}
            conflictSlots={conflictSlots}
            onPaint={paint}
            onPaintRange={paintRange}
            onLongPress={(slot) => setNoteSlot(slot)}
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

      {noteSlot !== null ? (
        <SlotSheet
          slot={noteSlot}
          entry={noteEntry}
          category={noteEntry ? categoriesById.get(noteEntry.categoryId) : undefined}
          prevEntry={prevEntry}
          onSaveNote={(note) => {
            if (noteEntry) {
              commit([{ slot: noteSlot, categoryId: noteEntry.categoryId, note }]);
            }
            setNoteSlot(null);
          }}
          onClear={() => {
            commit([{ slot: noteSlot, categoryId: null }]);
            setNoteSlot(null);
          }}
          onCopyPrevious={() => {
            if (prevEntry) {
              commit([{ slot: noteSlot, categoryId: prevEntry.categoryId, note: prevEntry.note }]);
            }
            setNoteSlot(null);
          }}
          onClose={() => setNoteSlot(null)}
        />
      ) : null}

      {calendarOpen ? (
        <CalendarSheet
          selectedDay={activeDay}
          today={today.day}
          onSelect={(d) => setDay(d)}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}
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
