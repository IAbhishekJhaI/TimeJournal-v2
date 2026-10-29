import type React from "react";

/**
 * Route-loading placeholders.
 *
 * Deliberately *not* a client component: these render on the server for
 * `loading.tsx` (zero JS on the critical path) while still being importable
 * from client components. Shapes mirror the real screens so the swap doesn't
 * shift layout.
 */

export function Skeleton({
  width,
  height,
  radius = 8,
  style,
}: {
  width?: number | string;
  height: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className="tj-skeleton"
      style={{ width: width ?? "100%", height, borderRadius: radius, ...style }}
    />
  );
}

/** Screen-reader announcement for an otherwise decorative placeholder screen. */
export function LoadingLabel({ children }: { children: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {children}
    </span>
  );
}

/** Sticky page header: title + subtitle on the left, actions on the right. */
export function HeaderSkeleton() {
  return (
    <div
      style={{
        padding: "14px 16px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Skeleton width={20} height={20} radius={4} />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <Skeleton width={132} height={17} radius={5} />
          <Skeleton width={168} height={12} radius={4} />
        </div>
      </div>
      <Skeleton width={62} height={26} radius={20} />
    </div>
  );
}

/**
 * The journal grid: 24 hour-rows of a label plus four 15-minute slots.
 * `rows` keeps the fallback to roughly a viewport's worth of work.
 */
export function TimelineSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div style={{ padding: "8px 12px 16px" }}>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} style={{ display: "flex", alignItems: "center", gap: 8, height: 56 }}>
          <Skeleton width={34} height={10} radius={3} style={{ flex: "none" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, flex: 1 }}>
            {Array.from({ length: 4 }).map((__, c) => (
              <Skeleton key={c} height={48} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A stack of full-width rows — ranked bars, list items, form fields. */
export function RowsSkeleton({
  count = 6,
  height = 44,
  gap = 8,
}: {
  count?: number;
  height?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}
