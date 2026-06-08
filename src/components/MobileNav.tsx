"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X, LogOut, User, Sparkles } from "lucide-react";
import SidebarNav, { icons, type SidebarNavItem } from "./SidebarNav";
import srcLogo from "@/assets/brand/src-logo.png";
import { cn } from "@/lib/utils";
import { useAiPanel } from "@/lib/stores/aiPanel";

// The pages that get a bottom-bar tab (in order). The rest live behind "More".
// Profile moved to the top-right avatar; the 4th slot is the AI co-coach.
const TAB_HREFS = ["/", "/calendar", "/workouts"];

/**
 * Mobile-only chrome (phones; the desktop sidebar is `hidden md:flex`):
 *  - a slim top bar: logo (tap → dashboard) + avatar (tap → profile)
 *  - an app-style bottom tab bar: main pages + AI chat + a "More" tab
 *  - the full nav in a slide-in drawer (opened from "More")
 */
export default function MobileNav({
  items,
  user,
  logout,
}: {
  items: SidebarNavItem[];
  user: { name: string; role: string };
  logout: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const aiOpen = useAiPanel((s) => s.open);
  const setAiOpen = useAiPanel((s) => s.setOpen);
  // The (app) layout persists across navigations, so close the drawer on route
  // change. React's "adjust state during render" pattern — no effect needed.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const tabs = TAB_HREFS
    .map((h) => items.find((i) => i.href === h))
    .filter((x): x is SidebarNavItem => !!x);

  const tabCls = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-0.5 flex-1 text-[10px] font-medium leading-none transition-colors",
      active ? "text-accent" : "text-muted hover:text-foreground",
    );

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white border-b border-border">
        <Link href="/" aria-label="Go to dashboard" className="flex items-center rounded-lg hover:opacity-80 transition-opacity">
          <Image src={srcLogo} alt="SRC by Peoplearth" width={32} height={32} className="h-8 w-8" priority />
        </Link>
        {/* Avatar → profile (where you can edit your details). */}
        <a
          href="/profile"
          aria-label="Your profile"
          className="flex items-center justify-center h-9 w-9 rounded-full bg-background border border-border text-foreground hover:border-accent transition-colors"
        >
          <User size={18} />
        </a>
      </header>

      {/* App-style bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-14">
          {tabs.map(({ href, label, icon }) => {
            const Icon = icons[icon];
            const active = isActive(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={tabCls(active)}>
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span className="truncate max-w-full px-0.5">{href === "/" ? "Home" : label}</span>
              </Link>
            );
          })}
          <button onClick={() => setAiOpen(true)} aria-label="AI co-coach" className={tabCls(aiOpen)}>
            <Sparkles size={20} strokeWidth={aiOpen ? 2.4 : 2} />
            <span>AI</span>
          </button>
          <button onClick={() => setOpen(true)} aria-label="More" className={tabCls(false)}>
            <Menu size={20} />
            <span>More</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[82%] bg-white flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <Image src={srcLogo} alt="SRC by Peoplearth" width={40} height={40} className="h-10 w-10" />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 rounded-lg hover:bg-background">
                <X size={20} />
              </button>
            </div>
            {/* Tapping a link navigates → close the drawer. */}
            <div className="flex-1 overflow-y-auto py-3" onClick={() => setOpen(false)}>
              <SidebarNav items={items} />
            </div>
            <div className="p-3 border-t border-border shrink-0">
              <div className="px-3 py-2">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted capitalize">{user.role}</div>
              </div>
              <form action={logout}>
                <button type="submit" className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-muted hover:bg-background">
                  <LogOut size={18} />
                  Log out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
