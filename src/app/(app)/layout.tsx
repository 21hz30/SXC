import { clearSession, getAccount } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";
import srcLogo from "@/assets/brand/src-logo.png";
import AiSidebar from "@/components/AiSidebar";
import ChatSessionsPanel from "@/components/ChatSessionsPanel";
import Toaster from "@/components/Toaster";
import OnboardingModal from "@/components/OnboardingModal";
import MainShell from "@/components/MainShell";
import SidebarNav, { type SidebarNavItem } from "@/components/SidebarNav";
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
  const nav: SidebarNavItem[] = [
    // Shared pages — everyone sees these (customers get a scoped, read-only view).
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/camps", label: "Camps", icon: "camps" },
    // Customers list is staff-only; athletes only ever see their own Profile.
    ...(isStaff ? ([{ href: "/customers", label: "Customers", icon: "customers" }] satisfies SidebarNavItem[]) : []),
    { href: "/workouts", label: "Workouts", icon: "workouts" },
    { href: "/profile", label: "Profile", icon: "profile" },
    ...(user.role === "admin"
      ? [
          { href: "/coaches", label: "Team", icon: "team" },
          { href: "/admin/standards", label: "Standards", icon: "standards" },
          { href: "/admin/prompts", label: "AI prompts", icon: "prompts" },
        ] satisfies SidebarNavItem[]
      : []),
  ];

  return (
    <div className="min-h-screen">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 border-r border-border bg-white flex-col z-20">
        <div className="px-5 py-5 shrink-0">
          <Image src={srcLogo} alt="SRC by Peoplearth" width={48} height={48} priority className="h-12 w-12" />
          <div className="text-xs text-muted mt-1.5">Hyrox Coach</div>
        </div>
        <SidebarNav items={nav} />
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
