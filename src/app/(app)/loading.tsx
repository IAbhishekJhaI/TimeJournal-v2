import { HeaderSkeleton, LoadingLabel, TimelineSkeleton } from "@/components/Skeleton";

/**
 * Fallback for the journal, and the inherited default for any nested route
 * without its own `loading.tsx`. Renders inside AppShell, so the bottom nav
 * is interactive while this shows.
 */
export default function JournalLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <LoadingLabel>Loading your journal…</LoadingLabel>
      <HeaderSkeleton />
      <div style={{ flex: 1, paddingBottom: 96 }}>
        <TimelineSkeleton />
      </div>
    </div>
  );
}
