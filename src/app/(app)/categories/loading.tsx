import { LoadingLabel, Skeleton } from "@/components/Skeleton";

/** Mirrors CategoryEditor: title + Add button, archived toggle, tree rows. */
export default function CategoriesLoading() {
  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "0 auto" }}>
      <LoadingLabel>Loading categories…</LoadingLabel>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "8px 0",
        }}
      >
        <Skeleton width={124} height={20} radius={5} />
        <Skeleton width={78} height={34} radius={10} />
      </div>

      <Skeleton width={132} height={13} radius={4} style={{ margin: "4px 0 12px" }} />

      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              paddingLeft: 12 + (i % 3 === 0 ? 0 : 20),
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <Skeleton width={26} height={26} radius={6} style={{ flex: "none" }} />
            <Skeleton width={i % 3 === 0 ? 148 : 116} height={14} radius={4} />
          </div>
        ))}
      </div>
    </div>
  );
}
