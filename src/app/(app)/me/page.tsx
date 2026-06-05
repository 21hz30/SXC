import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/lib/db";
import Markdown from "@/components/Markdown";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Athlete (customer-role) home. Shows any post-class reports the coach has
 * published for them. If the account isn't linked to a Customer record yet,
 * we fall back to the original placeholder.
 */
export default async function MePage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const user = await requireUser();
  const { open } = await searchParams;

  const userRow = await db.user.findUnique({
    where: { id: user.id },
    select: { customerId: true },
  });

  if (!userRow?.customerId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight">Hi, {user.name}</h1>
        <div className="mt-4 bg-card border border-border rounded-xl p-6 text-sm">
          <p>Your athlete portal is coming soon.</p>
          <p className="mt-3 text-muted">
            For now your coach manages your profile, workouts, and race results inside SXC.
            Once your account is linked, your post-class reports will appear here.
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

  const reports = await db.classReport.findMany({
    where: { customerId: userRow.customerId, publishedAt: { not: null } },
    include: { class: { select: { id: true, title: true, startsAt: true } } },
    orderBy: { class: { startsAt: "desc" } },
  });

  const openReport = open ? reports.find((r) => r.id === open) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <header className="flex items-baseline justify-between mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Hi, {user.name}</h1>
        <form action={async () => { "use server"; const { clearSession } = await import("@/lib/auth"); await clearSession(); const { redirect } = await import("next/navigation"); redirect("/login"); }}>
          <button type="submit" className="text-xs text-muted hover:text-accent">Log out</button>
        </form>
      </header>

      <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
        Your post-class reports
      </h2>

      {reports.length === 0 ? (
        <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
          No reports yet — your coach will publish one after your next class.
        </div>
      ) : openReport ? (
        <div>
          <Link href="/me" className="text-xs text-accent hover:underline">← Back to all reports</Link>
          <div className="mt-3 mb-2">
            <div className="text-xs text-muted">
              {formatDate(openReport.class.startsAt)} · {formatTime(openReport.class.startsAt)}
            </div>
            <div className="text-lg font-semibold">{openReport.class.title}</div>
          </div>
          <article className="bg-card border border-border rounded-xl p-6">
            <Markdown>{openReport.contentMarkdown}</Markdown>
          </article>
        </div>
      ) : (
        <ul className="divide-y divide-border bg-card border border-border rounded-xl">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/me?open=${r.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
              >
                <div>
                  <div className="font-medium">{r.class.title}</div>
                  <div className="text-xs text-muted">{formatDate(r.class.startsAt)}</div>
                </div>
                <span className="text-xs text-accent">Read →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 text-xs text-muted">
        Account: <code>{user.username}</code>
      </div>
    </div>
  );
}
