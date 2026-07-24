"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, CloudOff, Eraser, Palette, RadioTower, RefreshCw, Redo2, Undo2, UploadCloud } from "lucide-react";
import { useCategories, useEntries, useProfile } from "@/lib/client/hooks";
import { useSync } from "@/lib/client/sync";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import type { Category, TimeEntry } from "@/lib/api/types";
import { currentDayAndSlot, prettyDay, SLOTS_PER_DAY } from "@/lib/slots";
import { cellKey, dayWindow, liveWindow } from "@/lib/journalWindow";
import { onColor } from "@/lib/color";
import { CalendarSheet } from "./CalendarSheet";
import { CategoryPicker } from "./CategoryPicker";
import { DesktopGrid } from "./DesktopGrid";
import { DesktopPalette, type Brush } from "./DesktopPalette";
import { SlotSheet } from "./SlotSheet";
import { Timeline } from "./Timeline";

type View = { mode: "live" } | { mode: "day"; day: string };

export function JournalView() {
  const { data: profile } = useProfile();
  const timezone = profile?.timezone ?? "Asia/Kolkata";

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const today = currentDayAndSlot(timezone, now);

  // Default view is the rolling last-24-hours window; the calendar can pin a day.
  const [view, setView] = useState<View>({ mode: "live" });
  const win = useMemo(
    () =>
      view.mode === "live"
        ? liveWindow(timezone, now)
        : dayWindow(view.day, view.day === today.day ? today.slot : null),
    [view, timezone, now, today.day, today.slot],
  );
  const cells = win.cells;
  const currentIndex = win.currentIndex;
  const fromDay = cells[0].day;
  const toDay = cells[95].day;
  const viewKey = view.mode === "live" ? "live" : view.day;

  const { data: categories } = useCategories();
  // Two per-day queries (deduped when equal) so the existing per-day optimistic
  // cache + invalidation in sync.tsx keep working across the window's midnight.
  const q1 = useEntries(fromDay);
  const q2 = useEntries(toDay);
  const isLoading = q1.isLoading || q2.isLoading;
  const { enqueue, flush, online, pendingCount, syncing, conflicts, clearConflict, clearConflicts } =
    useSync();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [noteIndex, setNoteIndex] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // The remembered "brush": the category new taps paint with. "erase" clears.
  const [brush, setBrushState] = useState<Brush>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const v = localStorage.getItem("tj.brush");
    if (v) setBrushState(v as Brush);
  }, []);
  const setBrush = (b: Brush) => {
    setBrushState(b);
    if (b) localStorage.setItem("tj.brush", b);
    else localStorage.removeItem("tj.brush");
  };

  // Undo/redo. Each action records the cells' state BEFORE (undo) and the writes
  // it applied AFTER (redo); both replay through the queue, grouped by day.
  type SlotSnapshot = { day: string; slot: number; prev: { categoryId: string; note: string | null } | null };
  type WriteItem = { day: string; slot: number; categoryId: string | null; note: string | null };
  type Action = { before: SlotSnapshot[]; after: WriteItem[] };
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);

  const categoriesById = useMemo(
    () => new Map<string, Category>((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const entriesByKey = useMemo(() => {
    const m = new Map<string, TimeEntry>();
    for (const e of q1.data ?? []) m.set(cellKey(e.day, e.slot), e);
    for (const e of q2.data ?? []) m.set(cellKey(e.day, e.slot), e);
    return m;
  }, [q1.data, q2.data]);

  const windowKeys = useMemo(
    () => new Set(cells.map((c) => cellKey(c.day, c.slot))),
    [cells],
  );
  const conflictKeys = useMemo(
    () =>
      new Set(
        conflicts.map((c) => cellKey(c.day, c.slot)).filter((k) => windowKeys.has(k)),
      ),
    [conflicts, windowKeys],
  );

  const loggedCount = useMemo(
    () => cells.reduce((n, c) => n + (entriesByKey.has(cellKey(c.day, c.slot)) ? 1 : 0), 0),
    [cells, entriesByKey],
  );

  const recent = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of cells) {
      const e = entriesByKey.get(cellKey(c.day, c.slot));
      if (e) freq.set(e.categoryId, (freq.get(e.categoryId) ?? 0) + 1);
    }
    const used = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => categoriesById.get(id))
      .filter((c): c is Category => Boolean(c && !c.archived));
    const fillCats = (categories ?? []).filter((c) => !c.archived && !freq.has(c.id));
    return [...used, ...fillCats].slice(0, 4);
  }, [cells, entriesByKey, categories, categoriesById]);

  const baselineOf = (day: string, slot: number) =>
    entriesByKey.get(cellKey(day, slot))?.updatedAt ?? null;

  // Reset undo/redo when the view identity changes (not on live hour-rolls).
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [viewKey]);

  /** Replay writes through the queue, grouped by day, clearing conflict flags. */
  function applyWrites(items: WriteItem[]) {
    const byDay = new Map<string, { slot: number; categoryId: string | null; note: string | null; clientUpdatedAt: string | null }[]>();
    for (const i of items) {
      clearConflict(i.day, i.slot);
      const arr = byDay.get(i.day) ?? [];
      arr.push({ slot: i.slot, categoryId: i.categoryId, note: i.note, clientUpdatedAt: baselineOf(i.day, i.slot) });
      byDay.set(i.day, arr);
    }
    for (const [day, arr] of byDay) void enqueue(day, arr);
  }

  /** The single write path: record before/after for undo/redo, then apply. */
  function commit(items: { day: string; slot: number; categoryId: string | null; note?: string | null }[]) {
    if (items.length === 0) return;
    const before: SlotSnapshot[] = items.map((i) => {
      const e = entriesByKey.get(cellKey(i.day, i.slot));
      return { day: i.day, slot: i.slot, prev: e ? { categoryId: e.categoryId, note: e.note } : null };
    });
    const after: WriteItem[] = items.map((i) => ({
      day: i.day,
      slot: i.slot,
      categoryId: i.categoryId,
      note: i.note ?? null,
    }));
    setUndoStack((s) => [...s, { before, after }].slice(-100));
    setRedoStack([]);
    applyWrites(after);
  }

  function undo() {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, action].slice(-100));
    applyWrites(
      action.before.map((b) => ({
        day: b.day,
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

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const flushRef = useRef(flush);
  undoRef.current = undo;
  redoRef.current = redo;
  flushRef.current = flush;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && e.shiftKey) { e.preventDefault(); redoRef.current(); }
      else if (mod && key === "z") { e.preventDefault(); undoRef.current(); }
      else if (mod && key === "y") { e.preventDefault(); redoRef.current(); }
      else if (mod && key === "s") { e.preventDefault(); void flushRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function fill(indices: number[], categoryId: string | null) {
    commit(indices.map((i) => ({ day: cells[i].day, slot: cells[i].slot, categoryId })));
  }

  // Resolve the brush to a paintable target (null = erase; invalid/unset → pick).
  const brushCat = brush && brush !== "erase" ? categoriesById.get(brush) ?? null : null;
  const brushValid = brush === "erase" || brushCat !== null;

  /** A tap/drag on slots: paint with the current brush, or open the picker. */
  function activate(indices: number[], anchor: { x: number; y: number }) {
    if (indices.length === 0) return;
    if (!brushValid) {
      setPicker({ x: anchor.x, y: anchor.y });
      return;
    }
    const catId = brush === "erase" ? null : (brush as string);
    if (indices.length === 1) {
      const cell = cells[indices[0]];
      const existing = entriesByKey.get(cellKey(cell.day, cell.slot));
      const next = catId !== null && existing?.categoryId === catId ? null : catId; // toggle
      commit([{ day: cell.day, slot: cell.slot, categoryId: next }]);
    } else {
      commit(indices.map((i) => ({ day: cells[i].day, slot: cells[i].slot, categoryId: catId })));
    }
  }

  const noteCell = noteIndex !== null ? cells[noteIndex] : undefined;
  const noteEntry = noteCell ? entriesByKey.get(cellKey(noteCell.day, noteCell.slot)) : undefined;
  const prevCell = noteIndex !== null && noteIndex > 0 ? cells[noteIndex - 1] : undefined;
  const prevEntry = prevCell ? entriesByKey.get(cellKey(prevCell.day, prevCell.slot)) : undefined;

  if (!mounted) {
    return <div style={{ minHeight: "100dvh" }} aria-hidden />;
  }

  const isLive = view.mode === "live";
  const headerTitle = isLive ? "Last 24 hours" : view.day === today.day ? "Today" : prettyDay(view.day);
  const headerSub = isLive ? `${loggedCount} of ${SLOTS_PER_DAY} logged · live` : `${prettyDay(view.day)} · ${loggedCount} of ${SLOTS_PER_DAY} logged`;

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
              {headerTitle}
            </span>
            <span className="tabular" style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
              {headerSub}
            </span>
          </span>
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isLive ? (
            <button
              onClick={() => setView({ mode: "live" })}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: "var(--accent)", background: "none", border: "1px solid var(--border)", borderRadius: 20, padding: "5px 10px" }}
            >
              <RadioTower size={13} /> Live
            </button>
          ) : null}
          <UploadControl
            online={online}
            pendingCount={pendingCount}
            syncing={syncing}
            onUpload={() => void flush()}
          />
          {undoStack.length > 0 ? (
            <IconBtn label="Undo last change" onClick={undo}><Undo2 size={17} /></IconBtn>
          ) : null}
          {redoStack.length > 0 ? (
            <IconBtn label="Redo" onClick={redo}><Redo2 size={17} /></IconBtn>
          ) : null}
        </div>
      </header>

      <div aria-live="polite" className="sr-only">
        {conflictKeys.size > 0
          ? `${conflictKeys.size} slot${conflictKeys.size === 1 ? "" : "s"} in view changed on another device.`
          : ""}
      </div>

      {conflictKeys.size > 0 ? (
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 12px 0", padding: "8px 12px", fontSize: 13, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--warning)" }}
        >
          <AlertTriangle size={15} />
          <span style={{ flex: 1, color: "var(--text-secondary)" }}>
            {conflictKeys.size} slot{conflictKeys.size === 1 ? "" : "s"} changed on another device — your version was kept.
          </span>
          <button onClick={() => clearConflicts()} style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)", background: "none", border: "none" }}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div style={{ flex: 1, paddingBottom: isDesktop ? 16 : 96 }}>
        {isLoading ? (
          <TimelineSkeleton />
        ) : isDesktop ? (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", maxWidth: 1000, margin: "0 auto", padding: "0 16px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DesktopGrid
                cells={cells}
                entriesByKey={entriesByKey}
                categoriesById={categoriesById}
                categories={categories ?? []}
                currentIndex={currentIndex}
                conflictKeys={conflictKeys}
                onFill={fill}
                onPickFor={activate}
                onOpenNote={(index) => setNoteIndex(index)}
              />
            </div>
            <DesktopPalette categories={categories ?? []} brush={brush} onSelect={setBrush} />
          </div>
        ) : (
          <Timeline
            cells={cells}
            entriesByKey={entriesByKey}
            categoriesById={categoriesById}
            currentIndex={currentIndex}
            conflictKeys={conflictKeys}
            onPickFor={activate}
            onLongPress={(index) => setNoteIndex(index)}
          />
        )}
      </div>

      {!isDesktop ? (
        <button
          aria-label="Choose category"
          onClick={() =>
            setPicker({ x: typeof window !== "undefined" ? window.innerWidth / 2 : 180, y: typeof window !== "undefined" ? window.innerHeight - 96 : 600 })
          }
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom) + 12px)",
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "3px solid var(--bg)",
            background: brush === "erase" ? "var(--surface-2)" : brushCat?.color ?? "var(--accent)",
            color: brush === "erase" ? "var(--text-secondary)" : brushCat ? onColor(brushCat.color) : "var(--accent-contrast)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            zIndex: 45,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >
          {brush === "erase" ? <Eraser size={20} /> : brushCat ? brushCat.code : <Palette size={22} />}
        </button>
      ) : null}

      {picker ? (
        <CategoryPicker
          x={picker.x}
          y={picker.y}
          categories={categories ?? []}
          recent={recent}
          onPick={(categoryId) => {
            setBrush(categoryId === null ? "erase" : categoryId);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {noteIndex !== null && noteCell ? (
        <SlotSheet
          slot={noteCell.slot}
          entry={noteEntry}
          category={noteEntry ? categoriesById.get(noteEntry.categoryId) : undefined}
          prevEntry={prevEntry}
          onSaveNote={(note) => {
            if (noteEntry) commit([{ day: noteCell.day, slot: noteCell.slot, categoryId: noteEntry.categoryId, note }]);
            setNoteIndex(null);
          }}
          onClear={() => {
            commit([{ day: noteCell.day, slot: noteCell.slot, categoryId: null }]);
            setNoteIndex(null);
          }}
          onCopyPrevious={() => {
            if (prevEntry) commit([{ day: noteCell.day, slot: noteCell.slot, categoryId: prevEntry.categoryId, note: prevEntry.note }]);
            setNoteIndex(null);
          }}
          onClose={() => setNoteIndex(null)}
        />
      ) : null}

      {calendarOpen ? (
        <CalendarSheet
          selectedDay={view.mode === "day" ? view.day : today.day}
          today={today.day}
          onSelect={(d) => setView(d === today.day ? { mode: "live" } : { mode: "day", day: d })}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {children}
    </button>
  );
}

function UploadControl({
  online,
  pendingCount,
  syncing,
  onUpload,
}: {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  onUpload: () => void;
}) {
  // Offline: can't upload now — changes are queued and go up on reconnect.
  if (!online) {
    return (
      <span
        title="You're offline — changes are saved locally and will upload when you reconnect."
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "4px 8px", borderRadius: 20, background: "var(--surface-2)", color: "var(--warning)", border: "1px solid var(--border)" }}
      >
        <CloudOff size={12} />
        {`Offline${pendingCount ? ` · ${pendingCount}` : ""}`}
      </span>
    );
  }
  // Upload in flight.
  if (syncing) {
    return (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "4px 8px", borderRadius: 20, background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
      >
        <RefreshCw size={12} className="tj-spin" /> Uploading…
      </span>
    );
  }
  // Nothing queued — everything is already in the DB.
  if (pendingCount === 0) return null;
  // Pending changes waiting to be sent: the explicit upload button.
  return (
    <button
      onClick={onUpload}
      aria-label={`Upload ${pendingCount} change${pendingCount === 1 ? "" : "s"} to the database`}
      title="Send your pending changes to the database (Cmd/Ctrl+S)"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20, background: "var(--accent)", color: "var(--accent-contrast)", border: "none", cursor: "pointer" }}
    >
      <UploadCloud size={14} /> Upload {pendingCount}
    </button>
  );
}

function TimelineSkeleton() {
  return (
    <div style={{ padding: 12 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ height: 48, margin: "6px 0", borderRadius: 8, background: "var(--surface-2)", opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}
