import Link from "next/link";
import { clearSession, getAccount } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Home, Calendar, Users, Dumbbell, LogOut, Tent, Shield, Gauge, MessageSquare, User } from "lucide-react";
import AiSidebar from "@/components/AiSidebar";
import ChatSessionsPanel from "@/components/ChatSessionsPanel";
import Toaster from "@/components/Toaster";
import OnboardingModal from "@/components/OnboardingModal";
import MainShell from "@/components/MainShell";
import { Suspense } from "react";

async function logout() {
  "use server";
  await clearSession();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const user = account;

  // First-login onboarding: show the welcome modal until the athlete has
  // completed (or skipped) it once. `onboardedAt` comes from the same cached
  // account lookup — no extra query.
  const needsOnboarding = account.customerId != null && account.onboardedAt === null;

  const isStaff = user.role === "admin" || user.role === "coach";
  const nav = [
    // Shared pages — everyone sees these (customers get a scoped, read-only view).
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/calendar", label: "Calendar", icon: Calendar },
    { href: "/camps", label: "Camps", icon: Tent },
    // Customers list is staff-only; athletes only ever see their own Profile.
    ...(isStaff ? [{ href: "/customers", label: "Customers", icon: Users }] : []),
    { href: "/workouts", label: "Workouts", icon: Dumbbell },
    { href: "/profile", label: "Profile", icon: User },
    ...(user.role === "admin"
      ? [
          { href: "/coaches", label: "Team", icon: Shield },
          { href: "/admin/standards", label: "Standards", icon: Gauge },
          { href: "/admin/prompts", label: "AI prompts", icon: MessageSquare },
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

      <MainShell>{children}</MainShell>

      <AiSidebar user={{ name: user.name, role: user.role }} />
      <Suspense fallback={null}><Toaster /></Suspense>
      {needsOnboarding && <OnboardingModal firstName={user.name.split(" ")[0]} />}
    </div>
  );
}
