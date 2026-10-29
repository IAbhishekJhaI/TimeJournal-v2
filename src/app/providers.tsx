"use client";

import { useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { setTokenGetter } from "@/lib/client/api";
import { SyncProvider } from "@/lib/client/sync";

/** Hands Clerk's getToken to the API client so every call carries a fresh bearer token. */
function ClerkTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Before SyncProvider: sibling effects run in order, so the getter is
          installed before SyncProvider's mount-time flush. */}
      <ClerkTokenBridge />
      <SyncProvider>{children}</SyncProvider>
    </QueryClientProvider>
  );
}
