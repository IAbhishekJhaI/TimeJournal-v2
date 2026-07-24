"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, ListTree, Settings, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TimezoneSync } from "./TimezoneSync";
import { QuickLogSheet } from "./QuickLogSheet";

// Two tabs flank the raised centre quick-log button (FRONTEND_PLAN §1.2).
const LEFT_TABS = [
  { href: "/", label: "Journal", icon: LayoutGrid },
  { href: "/insights", label: "Insights", icon: BarChart3 },
] as const;
const RIGHT_TABS = [
  { href: "/categories", label: "Categories", icon: ListTree },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [quickOpen, setQuickOpen] = useState(false);

  // Global quick-log shortcut (Cmd/Ctrl+K).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <TimezoneSync />
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
        {LEFT_TABS.map((t) => (
          <NavItem key={t.href} {...t} active={isActive(pathname, t.href)} />
        ))}

        <button
          onClick={() => setQuickOpen(true)}
          aria-label="Quick log (Cmd/Ctrl+K)"
          title="Quick log (Cmd/Ctrl+K)"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            background: "none",
            border: "none",
            color: "var(--accent)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={19} />
          </span>
          Quick log
        </button>

        {RIGHT_TABS.map((t) => (
          <NavItem key={t.href} {...t} active={isActive(pathname, t.href)} />
        ))}
      </nav>

      <QuickLogSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
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
