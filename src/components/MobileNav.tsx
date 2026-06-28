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
import { LangToggle } from "@/components/I18nRuntime";

// The first three bottom-bar tabs (then AI, then a role-specific last slot).
// Customers lean on Camps over the workout library, so they get Camps here.
const STAFF_TABS = ["/", "/calendar", "/workouts"];
const CUSTOMER_TABS = ["/", "/calendar", "/camps"];

/**
 * Mobile-only chrome (phones; the desktop sidebar is `hidden md:flex`):
 *  - a slim top bar: logo (→ dashboard) + an avatar menu (info, profile, logout)
 *  - an app-style bottom tab bar: main pages + AI chat + a role-specific slot
 *    (staff: "More" drawer; customers: a Workouts tab)
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
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const aiOpen = useAiPanel((s) => s.open);
  const setAiOpen = useAiPanel((s) => s.setOpen);
  // The (app) layout persists across navigations, so close any popovers on route
  // change. React's "adjust state during render" pattern — no effect needed.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
    if (profileOpen) setProfileOpen(false);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const isStaff = user.role === "admin" || user.role === "coach";
  const tabs = (isStaff ? STAFF_TABS : CUSTOMER_TABS)
    .map((h) => items.find((i) => i.href === h))
    .filter((x): x is SidebarNavItem => !!x);
  const workoutTab = items.find((i) => i.href === "/workouts");

  const tabCls = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-0.5 flex-1 text-[10px] font-medium leading-none transition-colors",
      active ? "text-accent" : "text-muted hover:text-foreground",
    );

  const renderTabLink = ({ href, label, icon }: SidebarNavItem) => {
    const Icon = icons[icon];
    const active = isActive(href);
    // Close the AI chat panel when navigating, otherwise it stays open over the
    // page you just went to (so the tap looks like it did nothing).
    return (
      <Link key={href} href={href} onClick={() => setAiOpen(false)} aria-current={active ? "page" : undefined} className={tabCls(active)}>
        <Icon size={20} strokeWidth={active ? 2.4 : 2} />
        <span className="truncate max-w-full px-0.5">{href === "/" ? "Home" : label}</span>
      </Link>
    );
  };

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-white border-b border-border">
        <Link href="/" aria-label="Go to dashboard" className="flex items-center rounded-lg hover:opacity-80 transition-opacity">
          <Image src={srcLogo} alt="SRC by Peoplearth" width={32} height={32} className="h-8 w-8" priority />
        </Link>
        {/* Language switch + avatar menu (info, profile link, log out). */}
        <div className="flex items-center gap-2">
        <LangToggle compact />
        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            aria-label="Your account"
            aria-expanded={profileOpen}
            className="flex items-center justify-center h-9 w-9 rounded-full bg-background border border-border text-foreground hover:border-accent transition-colors"
          >
            <User size={18} />
          </button>
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} aria-hidden />
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <div className="text-sm font-medium truncate" data-no-i18n>{user.name}</div>
                  <div className="text-xs text-muted capitalize">{user.role}</div>
                </div>
                <a href="/profile" className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-background">
                  <User size={16} className="text-muted" /> View profile
                </a>
                <form action={logout} className="border-t border-border">
                  <button type="submit" className="flex items-center gap-2.5 px-4 py-2.5 w-full text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={16} /> Log out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
        </div>
      </header>

      {/* App-style bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-14">
          {tabs.map((t) => renderTabLink(t))}
          <button onClick={() => setAiOpen(true)} aria-label="AI co-coach" className={tabCls(aiOpen)}>
            <Sparkles size={20} strokeWidth={aiOpen ? 2.4 : 2} />
            <span>AI</span>
          </button>
          {isStaff ? (
            <button onClick={() => { setAiOpen(false); setOpen(true); }} aria-label="More" className={tabCls(false)}>
              <Menu size={20} />
              <span>More</span>
            </button>
          ) : (
            workoutTab && renderTabLink(workoutTab)
          )}
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
                <div className="text-sm font-medium truncate" data-no-i18n>{user.name}</div>
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
