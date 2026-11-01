"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  IconUser,
  IconClipboard,
  IconBarChart,
  IconSun,
  IconMoon,
  IconMenu,
  IconX,
} from "./Icons";

// ── Icons for sidebar ─────────────────────────────────────────

const IconHome = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

// ── Nav items ─────────────────────────────────────────────────

const NAV = [
  { href: "/",            label: "Dashboard",        Icon: IconHome },
  { href: "/volunteer",   label: "Volunteer",         Icon: IconUser },
  { href: "/coordinator", label: "Site Coordinator",  Icon: IconClipboard },
  { href: "/sponsor",     label: "Sponsor / IRB",     Icon: IconBarChart },
];

// ── Page meta ─────────────────────────────────────────────────

const PAGE_META: Record<string, { title: string; breadcrumb?: string }> = {
  "/":            { title: "Dashboard" },
  "/volunteer":   { title: "Volunteer Enrollment",   breadcrumb: "Volunteer" },
  "/coordinator": { title: "Site Coordinator",       breadcrumb: "Coordinator" },
  "/sponsor":     { title: "Sponsor / IRB Dashboard", breadcrumb: "Sponsor / IRB" },
};

// ── Theme hook ────────────────────────────────────────────────

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("tf_theme") as "light" | "dark" | null;
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const initial = stored ?? preferred;
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tf_theme", next);
  };

  return { theme, toggle };
}

// ── AppShell ──────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageMeta = PAGE_META[pathname] ?? { title: "TrialFence" };

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="mobile-overlay open"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${mobileOpen ? " mobile-open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-logo">
          <Link href="/" className="sidebar-logo-mark">
            <div className="sidebar-logo-icon" aria-hidden="true">TF</div>
            <div className="sidebar-logo-text">
              <span className="sidebar-logo-name">TrialFence</span>
              <span className="sidebar-logo-tagline">zk enrollment gate</span>
            </div>
          </Link>
        </div>

        <nav className="sidebar-nav" aria-label="Sections">
          <div className="sidebar-section-label">Navigation</div>
          {NAV.map(({ href, label, Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`sidebar-link${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontWeight: 600, color: "#FFFFFF", marginBottom: 2 }}>Clinical Precision UI</div>
          <div>Demonstration environment.</div>
          <div>Secret stays on device.</div>
        </div>
      </aside>

      {/* Content area */}
      <div className="content-area">
        {/* Topbar */}
        <header className="topbar" role="banner">
          <button
            className="topbar-menu-btn"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <IconX size={18} /> : <IconMenu size={18} />}
          </button>

          <div className="topbar-context">
            <div className="topbar-page-title">{pageMeta.title}</div>
            {pageMeta.breadcrumb && (
              <div className="topbar-breadcrumb">
                <Link href="/">Home</Link>
                <span style={{ margin: "0 6px", opacity: 0.5 }}>/</span>
                <span>{pageMeta.breadcrumb}</span>
              </div>
            )}
          </div>

          <div className="topbar-right">
            <div className="network-indicator" aria-label="Network status">
              <div className="network-dot" aria-hidden="true" />
              <span>Localhost Hardhat</span>
            </div>

            <button
              className="theme-toggle-btn"
              onClick={toggle}
              aria-label={`Current theme: ${theme}. Click to switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <span className="theme-toggle-icon">
                {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
              </span>
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="page-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
