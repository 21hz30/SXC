/**
 * Shared classification + badge styling for a training-plan item's completion
 * state, used by the customer profile and the customers summary panel.
 */
export type PlanState = "done" | "missed" | "upcoming" | "skipped" | "todo";

export const PLAN_STATE_META: Record<PlanState, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-700" },
  missed: { label: "Missed", cls: "bg-red-100 text-red-700" },
  upcoming: { label: "Upcoming", cls: "bg-sky-100 text-sky-700" },
  skipped: { label: "Skipped", cls: "bg-amber-100 text-amber-700" },
  todo: { label: "To do", cls: "bg-zinc-100 text-zinc-600" },
};

/** done (completed) → missed (past, not done) → upcoming (future) → todo (undated). */
export function planState(a: { status: string; scheduledDate: Date | null }, now: Date = new Date()): PlanState {
  if (a.status === "completed") return "done";
  if (a.status === "skipped") return "skipped";
  if (!a.scheduledDate) return "todo";
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return new Date(a.scheduledDate) < todayStart ? "missed" : "upcoming";
}

/** Adherence over "due" items (scheduled today or earlier). */
export function planAdherence(rows: { status: string; scheduledDate: Date | null }[], now: Date = new Date()) {
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const due = rows.filter((a) => a.scheduledDate && new Date(a.scheduledDate) <= todayEnd);
  const done = due.filter((a) => a.status === "completed").length;
  const missed = due.filter((a) => a.status !== "completed" && a.status !== "skipped").length;
  const upcoming = rows.filter((a) => a.scheduledDate && new Date(a.scheduledDate) > todayEnd && a.status !== "completed").length;
  return { done, missed, upcoming, pct: due.length ? Math.round((done / due.length) * 100) : null };
}
