"use client";

import type React from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAnalytics } from "@/lib/client/hooks";
import type { GroupBy, SummaryBucket } from "@/lib/api/types";

type Period = "day" | "week" | "month" | "year";
const PERIODS: Period[] = ["day", "week", "month", "year"];
const GROUPS: GroupBy[] = ["category", "parent", "color"];
const GROUP_LABEL: Record<GroupBy, string> = { category: "Category", parent: "Group", color: "Colour" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shift(anchor: string, period: Period, dir: number): string {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (period === "day") d.setUTCDate(d.getUTCDate() + dir);
  else if (period === "week") d.setUTCDate(d.getUTCDate() + 7 * dir);
  else if (period === "month") d.setUTCMonth(d.getUTCMonth() + dir);
  else d.setUTCFullYear(d.getUTCFullYear() + dir);
  return d.toISOString().slice(0, 10);
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function periodLabel(period: Period, from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`);
  if (period === "day") return `${WEEKDAYS[f.getUTCDay()]}, ${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
  if (period === "year") return String(f.getUTCFullYear());
  if (period === "month") return `${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
  const t = new Date(`${to}T00:00:00Z`);
  return `${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]} – ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
}

export default function InsightsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useAnalytics(period, anchor, groupBy);

  const buckets = data?.buckets ?? [];
  const totalMin = data?.totalMinutes ?? 0;
  const maxMin = buckets.reduce((m, b) => Math.max(m, b.minutes), 0);

  let pctOfPeriod = 0;
  if (data) {
    const days = Math.round((Date.parse(data.to) - Date.parse(data.from)) / 86_400_000) + 1;
    pctOfPeriod = days > 0 ? (totalMin / (days * 24 * 60)) * 100 : 0;
  }

  return (
    <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "8px 0 12px" }}>Insights</h1>

      <Segmented options={PERIODS} value={period} onChange={setPeriod} label={(p) => p[0].toUpperCase() + p.slice(1)} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0" }}>
        <button aria-label="Previous period" onClick={() => setAnchor((a) => shift(a, period, -1))} style={navBtn}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>
          {data ? periodLabel(period, data.from, data.to) : "…"}
        </span>
        <button aria-label="Next period" onClick={() => setAnchor((a) => shift(a, period, 1))} style={navBtn}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <Donut buckets={buckets} total={totalMin} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 500 }} className="tabular">{fmtDuration(totalMin)}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>logged this {period}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }} className="tabular">
            {Math.round(pctOfPeriod)}% of the period
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Segmented options={GROUPS} value={groupBy} onChange={setGroupBy} label={(g) => GROUP_LABEL[g]} />
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>
      ) : buckets.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: 24 }}>
          No time logged in this period.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {buckets.map((b) => (
            <BarRow key={b.key} bucket={b} maxMin={maxMin} totalMin={totalMin} />
          ))}
        </div>
      )}
    </div>
  );
}

function BarRow({ bucket, maxMin, totalMin }: { bucket: SummaryBucket; maxMin: number; totalMin: number }) {
  const pct = totalMin > 0 ? Math.round((bucket.minutes / totalMin) * 100) : 0;
  const width = maxMin > 0 ? (bucket.minutes / maxMin) * 100 : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, flex: "none", background: bucket.color }} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bucket.label}</span>
        </span>
        <span className="tabular" style={{ color: "var(--text-secondary)", flex: "none", marginLeft: 8 }}>
          {fmtDuration(bucket.minutes)} · {pct}%
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: bucket.color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function Donut({ buckets, total }: { buckets: SummaryBucket[]; total: number }) {
  const size = 96;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: "none" }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      {total > 0 &&
        buckets.map((b) => {
          const seg = (b.minutes / total) * circ;
          const el = (
            <circle
              key={b.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={b.color}
              strokeWidth={stroke}
              strokeDasharray={`${seg} ${circ - seg}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          acc += seg;
          return el;
        })}
    </svg>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              flex: 1,
              height: 32,
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--text)" : "var(--text-secondary)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label(opt)}
          </button>
        );
      })}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
