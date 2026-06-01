import Link from "next/link";
import { clearSession, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Home, Calendar, Users, Dumbbell, LogOut, Tent, Shield, Gauge } from "lucide-react";
import AiSidebar from "@/components/AiSidebar";
import ChatSessionsPanel from "@/components/ChatSessionsPanel";

async function logout() {
  "use server";
  await clearSession();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const nav = user.role === "customer"
    ? [{ href: "/me", label: "My profile", icon: Home }]
    : [
        { href: "/", label: "Dashboard", icon: Home },
        { href: "/calendar", label: "Calendar", icon: Calendar },
        { href: "/camps", label: "Camps", icon: Tent },
        { href: "/customers", label: "Customers", icon: Users },
        { href: "/workouts", label: "Workouts", icon: Dumbbell },
        ...(user.role === "admin"
          ? [
              { href: "/coaches", label: "Team", icon: Shield },
              { href: "/admin/standards", label: "Standards", icon: Gauge },
            ]
          : []),
      ];

  return (
    <div className="min-h-screen">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 border-r border-border bg-white flex-col z-20">
        <div className="px-5 py-5 shrink-0">
          <div className="text-2xl font-semibold tracking-tight">SXC</div>
          <div className="text-xs text-muted mt-0.5">Hyrox Coach</div>
        </div>
        <nav className="px-3 space-y-1 shrink-0">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground/80 hover:bg-background hover:text-foreground transition"
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <ChatSessionsPanel />
        <div className="p-3 border-t border-border shrink-0">
          <div className="px-3 py-2 mb-1">
            <div className="text-sm font-medium truncate">{user.name}</div>
            <div className="text-xs text-muted capitalize">{user.role}</div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-muted hover:bg-background"
            >
              <LogOut size={18} />
              Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="md:pl-60 xl:pr-96 min-h-screen">{children}</main>

      <AiSidebar user={{ name: user.name, role: user.role }} />
    </div>
  );
}
