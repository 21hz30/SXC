// A class's lifecycle status. Only "canceled" is stored (Class.canceledAt); the
// rest is derived so it's always correct without a cron job:
//   canceled  — a coach canceled it
//   finished  — its end time (start + duration) has passed
//   full      — roster is at capacity
//   open      — upcoming with spots left
export type ClassStatus = "open" | "full" | "finished" | "canceled";

export function classStatus(c: {
  canceledAt?: Date | null;
  startsAt: Date;
  durationMin?: number | null;
  capacity: number;
  rosterCount: number;
}): ClassStatus {
  if (c.canceledAt) return "canceled";
  if (c.startsAt.getTime() + (c.durationMin ?? 60) * 60_000 < Date.now()) return "finished";
  if (c.rosterCount >= c.capacity) return "full";
  return "open";
}

/** Only an "open" class accepts new sign-ups. */
export function canSignUp(status: ClassStatus): boolean {
  return status === "open";
}

export const CLASS_STATUS_META: Record<ClassStatus, { label: string; cls: string }> = {
  open:     { label: "Open",     cls: "bg-emerald-100 text-emerald-700" },
  full:     { label: "Full",     cls: "bg-amber-100 text-amber-700" },
  finished: { label: "Finished", cls: "bg-zinc-200 text-zinc-600" },
  canceled: { label: "Canceled", cls: "bg-red-100 text-red-700" },
};
