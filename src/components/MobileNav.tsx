"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X, LogOut } from "lucide-react";
import SidebarNav, { type SidebarNavItem } from "./SidebarNav";
import srcLogo from "@/assets/brand/src-logo.png";

/**
 * Mobile-only top bar + slide-in nav drawer. The desktop sidebar is
 * `hidden md:flex`, so on phones this is the only way to move between pages.
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
  // The (app) layout persists across navigations, so close the drawer on route
  // change. React's "adjust state during render" pattern — no effect needed.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white border-b border-border">
        <div className="flex items-center gap-2">
          <Image src={srcLogo} alt="SRC by Peoplearth" width={32} height={32} className="h-8 w-8" priority />
          <span className="text-xs text-muted">Hyrox Coach</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="-mr-2 p-2 rounded-lg hover:bg-background">
          <Menu size={22} />
        </button>
      </header>

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
