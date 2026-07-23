"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, ListTree, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Journal", icon: LayoutGrid },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/categories", label: "Categories", icon: ListTree },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, paddingBottom: "calc(var(--nav-h) + env(safe-area-inset-bottom))" }}>
        {children}
      </div>

      <nav
        aria-label="Primary"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "calc(var(--nav-h) + env(safe-area-inset-bottom))",
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-around",
          zIndex: 40,
        }}
      >
        {TABS.map((t) => (
          <NavItem key={t.href} {...t} active={isActive(pathname, t.href)} />
        ))}
      </nav>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(active && "tj-nav-active")}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        textDecoration: "none",
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontSize: 10,
      }}
    >
      <Icon size={22} />
      <span>{label}</span>
    </Link>
  );
}
