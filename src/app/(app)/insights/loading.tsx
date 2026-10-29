import { LoadingLabel, RowsSkeleton, Skeleton } from "@/components/Skeleton";

/** Mirrors InsightsPage: title, period segmented control, donut card, bars. */
export default function InsightsLoading() {
  return (
    <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
      <LoadingLabel>Loading insights…</LoadingLabel>

      <Skeleton width={104} height={20} radius={5} style={{ margin: "8px 0 12px" }} />
      <Skeleton height={34} radius={10} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "12px 0",
        }}
      >
        <Skeleton width={32} height={32} />
        <Skeleton width={148} height={14} radius={4} />
        <Skeleton width={32} height={32} />
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <Skeleton width={96} height={96} radius={48} style={{ flex: "none" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <Skeleton width={112} height={26} radius={6} />
          <Skeleton width={140} height={13} radius={4} />
          <Skeleton width={96} height={12} radius={4} />
        </div>
      </div>

      <Skeleton height={34} radius={10} style={{ marginBottom: 12 }} />
      <RowsSkeleton count={6} height={44} />
    </div>
  );
}
