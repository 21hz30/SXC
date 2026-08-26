"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Apple, Building2, Calendar, Dumbbell, Gauge, Home, MessageSquare, Shield, Tent, User, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const icons = {
  calendar: Calendar,
  camps: Tent,
  customers: Users,
  dashboard: Home,
  nutrition: Apple,
  profile: User,
  prompts: MessageSquare,
  standards: Gauge,
  team: Shield,
  tenants: Building2,
  workouts: Dumbbell,
} satisfies Record<string, LucideIcon>;

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
};

export default function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="px-3 space-y-1 shrink-0">
      {items.map(({ href, label, icon }) => {
        const Icon = icons[icon];
        const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        const className = cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition",
          active
            ? "bg-black text-white hover:bg-black hover:text-white"
            : "text-foreground/80 hover:bg-background hover:text-foreground",
        );
        const content = (
          <>
            <Icon size={18} />
            {label}
          </>
        );

        if (href === "/profile") {
          return (
            <a key={href} href={href} aria-current={active ? "page" : undefined} className={className}>
              {content}
            </a>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
