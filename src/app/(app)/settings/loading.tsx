import { LoadingLabel, Skeleton } from "@/components/Skeleton";

/** Mirrors SettingsPage: title then stacked labelled fields and actions. */
export default function SettingsLoading() {
  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "0 auto" }}>
      <LoadingLabel>Loading settings…</LoadingLabel>

      <Skeleton width={96} height={20} radius={5} style={{ margin: "8px 0 16px" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <Skeleton width={92} height={12} radius={4} style={{ marginBottom: 5 }} />
            <Skeleton height={40} radius={10} />
          </div>
        ))}
        <Skeleton height={44} radius={10} style={{ marginTop: 4 }} />
      </div>
    </div>
  );
}
