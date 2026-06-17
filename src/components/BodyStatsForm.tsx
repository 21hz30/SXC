"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { reloadWithFlash } from "@/lib/reloadWithFlash";

/**
 * Quick body-stats editor on the nutrition page. The athlete tweaks any of
 * { weight, height, age, gender } and saves; the page revalidates so the
 * targets (BMI, BMR, TDEE, protein/carbs/fat/fiber/water) all recompute on
 * the next render.
 */
export default function BodyStatsForm({
  initial,
  saveAction,
}: {
  initial: { weightKg: number | null; heightCm: number | null; age: number | null; gender: string | null };
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [weight, setWeight] = useState(initial.weightKg != null ? String(initial.weightKg) : "");
  const [height, setHeight] = useState(initial.heightCm != null ? String(initial.heightCm) : "");
  const [age, setAge] = useState(initial.age != null ? String(initial.age) : "");
  const [gender, setGender] = useState(initial.gender ?? "");
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("weightKg", weight);
    fd.set("heightCm", height);
    fd.set("age", age);
    fd.set("gender", gender);
    startPending(async () => {
      await saveAction(fd);
      reloadWithFlash("Body stats saved · targets updated");
    });
  }

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
  const labelCls = "block text-xs font-medium text-muted uppercase tracking-wide mb-1";

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Weight (kg)</label>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" min={0} step="0.1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Height (cm)</label>
          <input value={height} onChange={(e) => setHeight(e.target.value)} type="number" min={0} step="0.1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Age</label>
          <input value={age} onChange={(e) => setAge(e.target.value)} type="number" min={0} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Gender</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls + " bg-white"}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>
      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground text-white px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40"
        >
          <Save size={12} /> {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
