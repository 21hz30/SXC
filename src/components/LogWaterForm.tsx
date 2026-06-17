"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Droplet } from "lucide-react";

const QUICK_ML = [250, 500, 750, 1000];

/**
 * Quick water logging. Big tap-targets for the common bottle sizes plus a
 * custom-amount input, suitable for phones. A single shared `add()` runs the
 * server action whichever way the value arrives.
 */
export default function LogWaterForm({ addAction }: { addAction: (formData: FormData) => Promise<void> }) {
  const router = useRouter();
  const [custom, setCustom] = useState("");
  const [pending, startPending] = useTransition();

  function add(amountMl: number) {
    if (amountMl <= 0) return;
    const fd = new FormData();
    fd.set("amountMl", String(amountMl));
    startPending(async () => {
      await addAction(fd);
      setCustom("");
      router.refresh();
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="text-xs font-medium text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Droplet size={13} className="text-sky-500" /> Log water
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK_ML.map((ml) => (
          <button
            key={ml}
            type="button"
            onClick={() => add(ml)}
            disabled={pending}
            className="rounded-lg border border-border bg-background hover:border-sky-300 hover:bg-sky-50 px-3 py-3 text-center disabled:opacity-40"
          >
            <div className="text-base font-semibold">+{ml} ml</div>
            <div className="text-[11px] text-muted">{ml / 1000} L</div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          type="number"
          min={0}
          placeholder="custom ml"
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => add(Number(custom) || 0)}
          disabled={pending || !custom || Number(custom) <= 0}
          className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
