"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "@/components/Toaster";

type Exercise = { id: string; label: string };

/**
 * Athlete-facing check-in for one assigned plan workout. Tick each exercise as
 * you do it (auto-completes when all are ticked), then log how it felt. Posts to
 * /api/assignment/[id], which is scoped to the caller's own assignment.
 */
export default function PlanCheckIn({
  assignmentId,
  exercises,
  initialResults,
  initialStatus,
  initialRpe,
  initialFeeling,
}: {
  assignmentId: string;
  exercises: Exercise[];
  initialResults: Record<string, string>;
  initialStatus: string;
  initialRpe: number | null;
  initialFeeling: string | null;
}) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(
    new Set(exercises.filter((e) => initialResults[e.id] === "done").map((e) => e.id)),
  );
  const [status, setStatus] = useState(initialStatus);
  const [rpe, setRpe] = useState(initialRpe?.toString() ?? "");
  const [feeling, setFeeling] = useState(initialFeeling ?? "");
  const [busy, setBusy] = useState(false);

  const total = exercises.length;
  const doneCount = done.size;

  async function patch(body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/assignment/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      if (okMsg) toast(okMsg);
      router.refresh();
      return true;
    } catch {
      toast("Could not save — try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string) {
    const next = new Set(done);
    const nowDone = !next.has(id);
    if (nowDone) next.add(id);
    else next.delete(id);
    setDone(next);
    // Local status mirror of the server's auto-complete rule.
    setStatus(total > 0 && next.size === total ? "completed" : "assigned");
    await patch({ toggleItemId: id, done: nowDone });
  }

  if (status === "skipped") {
    return (
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted">Skipped — you sat this one out.</span>
        <button onClick={() => { setStatus("assigned"); patch({ status: "assigned" }, "Back on the plan"); }} disabled={busy} className="text-xs text-accent hover:underline">Undo</button>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {total > 0 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-muted uppercase tracking-wide">Check in ({doneCount}/{total})</span>
            {status === "completed" && <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">Completed</span>}
          </div>
          <ul className="space-y-1 mb-3">
            {exercises.map((e) => {
              const checked = done.has(e.id);
              return (
                <li key={e.id}>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(e.id)} className="rounded border-border" />
                    <span className={checked ? "line-through text-muted" : ""}>{e.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <div>
          <label className="block text-[10px] text-muted mb-0.5">RPE (1–10)</label>
          <input value={rpe} onChange={(e) => setRpe(e.target.value)} type="number" min={1} max={10} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-muted mb-0.5">How it felt</label>
          <input value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="legs heavy…" className="w-full rounded-md border border-border px-2 py-1 text-xs" />
        </div>
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={() => { setStatus("skipped"); patch({ status: "skipped" }, "Marked skipped"); }}
            disabled={busy}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
          >
            Skip
          </button>
          <button
            onClick={() => { setStatus("completed"); patch({ status: "completed", rpe: rpe ? Number(rpe) : null, feeling: feeling || null }, "Logged — nice work"); }}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Check size={12} /> {status === "completed" ? "Update" : "Mark done"}
          </button>
        </div>
      </div>
    </div>
  );
}
