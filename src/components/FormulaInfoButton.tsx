"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";

/**
 * Tiny "info" icon that opens a centred modal explaining where the dashboard's
 * nutrition targets come from. Pure presentation — the coefficients are passed
 * in so the same component renders whatever's configured (per-coach in the
 * future). Closes on backdrop click or Escape.
 */
export default function FormulaInfoButton({
  proteinGPerKg,
  carbsGPerKg,
  fatGPerKg,
  waterMlPerKg,
  activityMultiplier,
}: {
  proteinGPerKg: number;
  carbsGPerKg: number;
  fatGPerKg: number;
  waterMlPerKg: number;
  activityMultiplier: number;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape and lock the page scroll while the modal is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How are these targets calculated?"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted hover:text-foreground hover:bg-background transition"
      >
        <Info size={13} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
          >
            <header className="flex items-start justify-between gap-2 px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">How are these targets calculated?</h3>
                <p className="text-[11px] text-muted mt-0.5">Daily macros scale to your body weight.</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-muted hover:text-foreground rounded-md hover:bg-background" aria-label="Close">
                <X size={15} />
              </button>
            </header>
            <div className="px-5 py-4 space-y-2 text-xs">
              <Row label="Protein" formula={`${proteinGPerKg} g × kg body weight`} />
              <Row label="Carbs" formula={`${carbsGPerKg} g × kg`} />
              <Row label="Fat" formula={`${fatGPerKg} g × kg`} />
              <Row label="Water" formula={`${waterMlPerKg} ml × kg + 500 ml per hour of training today`} />
              <Row
                label="Calories at rest"
                formula="Mifflin-St Jeor — 10·kg + 6.25·cm − 5·age + (male: +5, female: −161)"
              />
              <Row label="Daily calorie target (TDEE)" formula={`Calories at rest × ${activityMultiplier} (moderate activity)`} />
            </div>
            <footer className="px-5 py-3 border-t border-border bg-background/40 flex items-center justify-between gap-2 flex-wrap">
              <Link
                href="/nutrition#body"
                onClick={() => setOpen(false)}
                className="text-xs text-accent hover:underline"
              >
                Update body stats →
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-foreground text-white px-3 py-1.5 text-xs font-medium hover:opacity-90"
              >
                Got it
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, formula }: { label: string; formula: string }) {
  return (
    <div>
      <div className="font-semibold text-foreground">{label}</div>
      <div className="text-muted leading-snug">{formula}</div>
    </div>
  );
}
