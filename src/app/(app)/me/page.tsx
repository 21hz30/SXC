import { requireUser } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Placeholder home for customer (athlete) accounts. The customer-facing UI
 * isn't designed yet, so this page just acknowledges the account and tells
 * them to wait for their coach to link them up.
 */
export default async function MePage() {
  const user = await requireUser();
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight">Hi, {user.name}</h1>
      <div className="mt-4 bg-card border border-border rounded-xl p-6 text-sm">
        <p>Your athlete portal is coming soon.</p>
        <p className="mt-3 text-muted">
          For now your coach manages your profile, workouts, and race results inside SXC.
          Once the athlete view is ready, you&apos;ll be able to see your benchmarks,
          performance history, and upcoming sessions here.
        </p>
        <form action={async () => { "use server"; const { clearSession } = await import("@/lib/auth"); await clearSession(); const { redirect } = await import("next/navigation"); redirect("/login"); }} className="mt-4">
          <button type="submit" className="text-xs text-accent hover:underline">Log out</button>
        </form>
      </div>
      <div className="mt-6 text-xs text-muted">
        Account: <code>{user.username}</code> · Role: <code>{user.role}</code>
        {" "}<Link href="/login" className="text-accent hover:underline">(switch account)</Link>
      </div>
    </div>
  );
}
