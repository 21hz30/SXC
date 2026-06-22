"use client";

import { useState } from "react";

type Props = {
  assignmentId: string;
  workoutName: string;
  /** The dashboard's `logMyAssignment` server action (marks the assignment done
   *  and saves rpe/feeling/notes). Passed in so this popup reuses one code path. */
  action: (formData: FormData) => void | Promise<void>;
};

/**
 * "Mark done" for a daily plan workout. Instead of inline feedback fields that
 * are easy to skip, tapping the button pops a focused sheet asking how the
 * session went (RPE / feeling / notes). Submitting marks the assignment done and
 * saves the feedback in one go; everything stays optional, so an athlete in a
 * hurry can just hit save. Relax sessions don't use this — they tick off plain.
 */
export default function MarkDoneFeedback({ assignmentId, workoutName, action }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-border flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:opacity-90"
      >
        Mark done
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">How did it go?</h2>
            <p className="text-sm text-muted mt-0.5 mb-4 leading-snug truncate" data-no-i18n>{workoutName}</p>

            <form action={action}>
              <input type="hidden" name="assignmentId" value={assignmentId} />
              <input type="hidden" name="status" value="completed" />

              <label className="block text-xs font-medium mb-1">RPE (1–10)</label>
              <input
                name="rpe"
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                autoFocus
                placeholder="how hard did it feel?"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent mb-3"
              />

              <label className="block text-xs font-medium mb-1">Feeling</label>
              <input
                name="feeling"
                placeholder="legs heavy, strong, tired…"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent mb-3"
              />

              <label className="block text-xs font-medium mb-1">Notes</label>
              <input
                name="notes"
                placeholder="anything worth noting…"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent mb-4"
              />

              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">Cancel</button>
                <button type="submit" className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:opacity-90">Save &amp; mark done</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
