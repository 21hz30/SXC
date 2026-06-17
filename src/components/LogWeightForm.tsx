"use client";

import { useState, useTransition } from "react";
import { Scale } from "lucide-react";
import { reloadWithFlash } from "@/lib/reloadWithFlash";

/**
 * Quick body-weight entry. One kg input + an optional note, saves a row in
 * WeightLog and (server-side) snaps Customer.weightKg to the new reading so
 * BMR/TDEE math always uses the latest weigh-in.
 *
 * The most recent reading is shown above the input so the athlete sees what
 * they're updating without having to scroll the history list.
 */
export default function LogWeightForm({
  saveAction,
  latestKg,
  latestLoggedAtText,
}: {
  saveAction: (formData: FormData) => Promise<void>;
  latestKg: number | null;
  /** Pre-formatted date string (yyyy-mm-dd) so SSR and client agree. */
  latestLoggedAtText: string | null;
}) {
  const [weight, setWeight] = useState(latestKg != null ? String(latestKg) : "");
  const [notes, setNotes] = useState("");
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const kg = Number(weight);
    if (!Number.isFinite(kg) || kg <= 0 || kg > 400) {
      setError("Enter a valid weight in kilograms.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("weightKg", String(kg));
    if (notes.trim()) fd.set("notes", notes.trim());
    startPending(async () => {
      await saveAction(fd);
      reloadWithFlash(`Weight saved — ${kg} kg`);
    });
  }

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
  const labelCls = "block text-xs font-medium text-muted uppercase tracking-wide mb-1";

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="text-xs font-medium text-muted uppercase tracking-wide flex items-center gap-1.5">
        <Scale size={13} className="text-foreground/60" /> Log weight
      </div>
      {latestKg != null && (
        <div className="text-[11px] text-muted">
          Last weigh-in: <span className="font-semibold text-foreground tabular-nums">{latestKg} kg</span>
          {latestLoggedAtText && <span className="ml-1">· {latestLoggedAtText}</span>}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Weight (kg)</label>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            type="number"
            min={0}
            step="0.1"
            placeholder="e.g. 75.2"
            className={inputCls}
            required
          />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notes (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. morning, after toilet"
            className={inputCls}
          />
        </div>
      </div>
      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !weight}
          className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save weight"}
        </button>
      </div>
    </form>
  );
}
