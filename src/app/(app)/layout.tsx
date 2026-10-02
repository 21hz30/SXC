import { clearSession, getAccount } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import srcLogo from "@/assets/brand/src-logo.png";
import AiSidebar from "@/components/AiSidebar";
import ChatSessionsPanel from "@/components/ChatSessionsPanel";
import Toaster from "@/components/Toaster";
import OnboardingModal from "@/components/OnboardingModal";
import PhoneModal from "@/components/PhoneModal";
import MainShell from "@/components/MainShell";
import MobileNav from "@/components/MobileNav";
import SidebarNav, { type SidebarNavItem } from "@/components/SidebarNav";
import { LangToggle } from "@/components/I18nRuntime";
import { Suspense } from "react";
import { FEATURES } from "@/lib/features";

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

  // Phone backfill: every account now needs a recovery number. Prompt legacy
  // accounts once, after any first-login onboarding (gating on
  // `!needsOnboarding` keeps the two blocking modals from stacking).
  const needsPhone =
    account.customerId != null && !account.phoneNormalized && !needsOnboarding;

  const isStaff = user.role === "admin" || user.role === "coach";
  const nav: SidebarNavItem[] = [
    // Shared pages — everyone sees these (customers get a scoped, read-only view).
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/camps", label: "Camps", icon: "camps" },
    // Customers list is staff-only; athletes only ever see their own Profile.
    // Customers and staff accounts live under one People entry; admins can
    // switch to Team management from the Customers page.
    ...(isStaff
      ? ([
          { href: "/customers", label: "People", icon: "customers" },
        ] satisfies SidebarNavItem[])
      : []),
    { href: "/workouts", label: "Training", icon: "workouts" },
    ...(FEATURES.nutrition
      ? ([{ href: "/nutrition", label: "Nutrition", icon: "nutrition" }] satisfies SidebarNavItem[])
      : []),
    { href: "/profile", label: "Profile", icon: "profile" },
    ...(user.role === "admin"
      ? [
          { href: "/admin/tenants", label: "Tenants", icon: "tenants" },
          { href: "/admin/standards", label: "Standards", icon: "standards" },
          { href: "/admin/prompts", label: "AI prompts", icon: "prompts" },
        ] satisfies SidebarNavItem[]
      : []),
  ];

  return (
    <div className="min-h-screen">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 border-r border-border bg-white flex-col z-20">
        <div className="px-5 py-5 shrink-0">
          <Link href="/" aria-label="Go to dashboard" className="inline-block rounded-lg hover:opacity-80 transition-opacity">
            <Image src={srcLogo} alt="SRC - Hybrid Training Platform" width={48} height={48} priority className="h-12 w-12" />
          </Link>
        </div>
        <SidebarNav items={nav} />
        <ChatSessionsPanel />
        <div className="p-3 border-t border-border shrink-0">
          <div className="px-3 py-2 mb-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate" data-no-i18n>{user.name}</div>
              <div className="text-xs text-muted capitalize">{user.role}</div>
            </div>
            <LangToggle compact />
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

      <MobileNav items={nav} user={{ name: user.name, role: user.role }} logout={logout} />

      <MainShell>{children}</MainShell>

      <AiSidebar user={{ name: user.name, role: user.role }} />
      <Suspense fallback={null}><Toaster /></Suspense>
      {needsOnboarding && <OnboardingModal firstName={user.name.split(" ")[0]} />}
      {needsPhone && <PhoneModal />}
    </div>
  );
}
