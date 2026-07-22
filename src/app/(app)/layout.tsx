import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireUserOrRedirect } from "@/lib/auth/server";

/** Authenticated app group — guards every page under it and adds the shell. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUserOrRedirect();
  return <AppShell>{children}</AppShell>;
}
