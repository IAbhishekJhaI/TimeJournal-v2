"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Sparkles, X } from "lucide-react";
import { useCategories, useQuicklogParse } from "@/lib/client/hooks";
import { useSync } from "@/lib/client/sync";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import { onColor } from "@/lib/color";
import { prettyDay, slotTimeLabel } from "@/lib/slots";
import type { Category } from "@/lib/api/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Cand = { id: string; code: string; name: string };
type Parsed = {
  day: string;
  startSlot: number;
  endSlot: number;
  assumedMeridiem: boolean;
  category: Cand | null;
  candidates: Cand[];
};
type Range = { startSlot: number; endSlot: number };

/** Label for a slot range, e.g. "9:00–11:00" (end is exclusive of the slot). */
function rangeLabel(r: Range): string {
  const end = r.endSlot >= 95 ? "24:00" : slotTimeLabel(r.endSlot + 1);
  return `${slotTimeLabel(r.startSlot)}–${end}`;
}

/**
 * Global quick-log overlay. Type a phrase ("9-11 studying"), the server parses
 * it into a slot range + category proposal, and — only after you confirm, with
 * an explicit AM/PM or category pick whenever the parse is ambiguous — the slots
 * are queued for upload. Never auto-commits ambiguity (FRONTEND_PLAN §5.5).
 */
export function QuickLogSheet({ open, onClose }: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const parse = useQuicklogParse();
  const { enqueue } = useSync();
  const { data: categories } = useCategories();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [selCat, setSelCat] = useState<string | null>(null);

  const colorById = useMemo(
    () => new Map<string, Category>((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  function reset() {
    setText("");
    setParsed(null);
    setReason(null);
    setRange(null);
    setSelCat(null);
    parse.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Focus the field when opened; reset when closed. Escape closes.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
    reset();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // When the meridiem was assumed, the true reading is 12h (48 slots) away —
  // offer both so the user picks explicitly.
  const meridiemOptions = useMemo<Range[] | null>(() => {
    if (!parsed || !parsed.assumedMeridiem) return null;
    const duration = parsed.endSlot - parsed.startSlot;
    const base = parsed.startSlot % 48;
    return [base, base + 48].map((start) => ({
      startSlot: Math.max(0, start),
      endSlot: Math.min(95, start + duration),
    }));
  }, [parsed]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await parse.mutateAsync({ text: text.trim() });
    if (!res.ok) {
      setReason(res.reason);
      setParsed(null);
      setRange(null);
      return;
    }
    setReason(null);
    setParsed(res);
    setRange({ startSlot: res.startSlot, endSlot: res.endSlot });
    setSelCat(res.category?.id ?? null);
    // Move focus off the text field so arrow keys navigate the preview and
    // Enter confirms, rather than re-parsing.
    window.setTimeout(() => sheetRef.current?.focus(), 0);
  }

  async function onConfirm() {
    if (!parsed || !range || !selCat) return;
    const items: { slot: number; categoryId: string }[] = [];
    for (let s = range.startSlot; s <= range.endSlot; s++) {
      items.push({ slot: s, categoryId: selCat });
    }
    await enqueue(parsed.day, items);
    handleClose();
  }

  // Keyboard nav within the preview: arrows switch the AM/PM option, Enter logs.
  function onSheetKeyDown(e: React.KeyboardEvent) {
    if (e.target === inputRef.current) return; // the text field handles its own keys
    if (!parsed || !range) return;
    const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (meridiemOptions && arrows.includes(e.key)) {
      e.preventDefault();
      const idx = Math.max(0, meridiemOptions.findIndex((o) => o.startSlot === range.startSlot));
      const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
      const next = (idx + (back ? meridiemOptions.length - 1 : 1)) % meridiemOptions.length;
      setRange(meridiemOptions[next]);
      return;
    }
    // Enter confirms — unless focus is on a button, where the native click handles it.
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
      e.preventDefault();
      if (range && selCat) void onConfirm();
    }
  }

  if (!open) return null;

  const slotCount = range ? range.endSlot - range.startSlot + 1 : 0;
  const noMatch = parsed !== null && !parsed.category && parsed.candidates.length === 0;
  const canConfirm = Boolean(range && selCat);

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick log" style={overlay(isDesktop)}>
      <div onClick={handleClose} style={scrim} />
      <div ref={sheetRef} tabIndex={-1} onKeyDown={onSheetKeyDown} style={{ ...sheet(isDesktop), outline: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 600 }}>
            <Sparkles size={16} style={{ color: "var(--accent)" }} /> Quick log
          </span>
          <button aria-label="Close" onClick={handleClose} style={closeBtn}><X size={18} /></button>
        </div>

        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <form onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 9-11 studying · 930-11 Fb · lunch 1-1:30pm"
              aria-label="Quick log text"
              style={input}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" disabled={!text.trim() || parse.isPending} style={{ ...primaryBtn, flex: 1, opacity: !text.trim() || parse.isPending ? 0.6 : 1 }}>
                {parse.isPending ? "Parsing…" : "Preview"}
              </button>
            </div>
          </form>

          {reason ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
              Couldn’t parse that: {reason}
            </p>
          ) : null}

          {parse.isError ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
              Something went wrong parsing that. Try again.
            </p>
          ) : null}

          {parsed && range ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {prettyDay(parsed.day)} · <span className="tabular" style={{ color: "var(--text)", fontWeight: 500 }}>{rangeLabel(range)}</span>{" "}
                · {slotCount} slot{slotCount === 1 ? "" : "s"}
              </div>

              {/* Explicit AM/PM pick when the meridiem was assumed. */}
              {meridiemOptions ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--warning)", marginBottom: 6 }}>
                    <AlertTriangle size={13} /> AM/PM was assumed — pick the right one:
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {meridiemOptions.map((opt) => {
                      const active = range.startSlot === opt.startSlot;
                      return (
                        <button
                          key={opt.startSlot}
                          onClick={() => setRange(opt)}
                          className="tabular"
                          style={{ ...chip(active), flex: 1 }}
                        >
                          {rangeLabel(opt)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Category: confident match, candidate pick, or no match. */}
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                  {parsed.candidates.length > 0 ? "Which category?" : "Category"}
                </div>
                {noMatch ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
                    No matching category — add a code or name to your text (e.g. “{text.trim()} Fb”).
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(parsed.category ? [parsed.category] : parsed.candidates).map((c) => {
                      const cat = colorById.get(c.id);
                      const active = selCat === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelCat(c.id)}
                          style={catChip(active)}
                        >
                          <span
                            style={{ width: 20, height: 20, borderRadius: 5, flex: "none", background: cat?.color ?? "var(--surface-2)", color: cat ? onColor(cat.color) : "var(--text-muted)", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            {c.code}
                          </span>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button onClick={onConfirm} disabled={!canConfirm} style={{ ...primaryBtn, height: 46, justifyContent: "center", opacity: canConfirm ? 1 : 0.5 }}>
                Log {slotCount} slot{slotCount === 1 ? "" : "s"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const overlay = (isDesktop: boolean): React.CSSProperties => ({
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "flex",
  flexDirection: "column",
  justifyContent: isDesktop ? "flex-start" : "flex-end",
  alignItems: isDesktop ? "center" : undefined,
  paddingTop: isDesktop ? "12vh" : undefined,
});
const scrim: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" };
const sheet = (isDesktop: boolean): React.CSSProperties => ({
  position: "relative",
  width: isDesktop ? "min(520px, 92vw)" : undefined,
  background: "var(--surface)",
  borderRadius: isDesktop ? 16 : "16px 16px 0 0",
  maxHeight: "82dvh",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  paddingBottom: isDesktop ? 0 : "env(safe-area-inset-bottom)",
  boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
});
const closeBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--surface-2)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" };
const input: React.CSSProperties = { width: "100%", padding: "12px 14px", fontSize: 16, color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", outline: "none" };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, color: "var(--accent-contrast)", background: "var(--accent)", border: "none", borderRadius: "var(--radius)", height: 42, justifyContent: "center", cursor: "pointer" };

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 10,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
    background: active ? "var(--surface-2)" : "var(--surface)",
    color: "var(--text)",
    boxShadow: active ? "inset 0 0 0 1px var(--accent)" : "none",
    cursor: "pointer",
  };
}

function catChip(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 10px 6px 6px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 20,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
    background: active ? "var(--surface-2)" : "var(--surface)",
    color: "var(--text)",
    boxShadow: active ? "inset 0 0 0 1px var(--accent)" : "none",
    cursor: "pointer",
  };
}
