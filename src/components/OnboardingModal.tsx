"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UPCOMING_RACES } from "@/domain/races";

type Props = { firstName: string };

const DIVISIONS = [
  { value: "open", label: "Open" },
  { value: "pro", label: "Pro" },
  { value: "doubles", label: "Doubles" },
  { value: "relay", label: "Relay" },
];

type DivEntry = { on: boolean; min: string; sec: string };
const emptyDivs = (): Record<string, DivEntry> =>
  Object.fromEntries(DIVISIONS.map((d) => [d.value, { on: false, min: "", sec: "" }]));

function toSec(e: DivEntry): number | null {
  const m = Number(e.min || 0);
  const s = Number(e.sec || 0);
  return m || s ? m * 60 + s : null;
}

/**
 * First-login onboarding — a 3-step wizard:
 *   1. Basics (gender, age, height, weight, phone)
 *   2. Divisions completed + PB per division   → seeds RaceResults
 *   3. Next race date + divisions planned + goal → seeds RaceGoals
 * Saving (or skipping) marks onboarding complete so it never reappears.
 */
export default function OnboardingModal({ firstName }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [basics, setBasics] = useState({ gender: "", age: "", heightCm: "", weightKg: "", phone: "" });
  const [finished, setFinished] = useState<Record<string, DivEntry>>(emptyDivs);
  const [noRaces, setNoRaces] = useState(false); // "I haven't raced a Hyrox yet"
  // Planned races: raceId → list of divisions the athlete plans for that race.
  const [plans, setPlans] = useState<Record<string, string[]>>({});

  function setB(k: keyof typeof basics, v: string) {
    setBasics((c) => ({ ...c, [k]: v }));
  }
  function toggle(map: Record<string, DivEntry>, set: typeof setFinished, d: string) {
    set({ ...map, [d]: { ...map[d], on: !map[d].on } });
  }
  function setTime(map: Record<string, DivEntry>, set: typeof setFinished, d: string, k: "min" | "sec", v: string) {
    set({ ...map, [d]: { ...map[d], [k]: v } });
  }
  function toggleRace(raceId: string) {
    setPlans((c) => {
      const next = { ...c };
      if (raceId in next) delete next[raceId];
      else next[raceId] = [];
      return next;
    });
  }
  function toggleRaceDivision(raceId: string, division: string) {
    setPlans((c) => {
      const cur = c[raceId] ?? [];
      const next = cur.includes(division) ? cur.filter((d) => d !== division) : [...cur, division];
      return { ...c, [raceId]: next };
    });
  }

  async function finish() {
    setSaving(true);
    const payload = {
      gender: basics.gender || null,
      age: basics.age || null,
      heightCm: basics.heightCm || null,
      weightKg: basics.weightKg || null,
      phone: basics.phone || null,
      finished: noRaces
        ? []
        : DIVISIONS.filter((d) => finished[d.value].on).map((d) => ({
            division: d.value,
            pbSec: toSec(finished[d.value]),
          })),
      racePlans: Object.entries(plans).flatMap(([raceId, divs]) =>
        divs.map((division) => ({ raceId, division })),
      ),
    };
    await fetch("/api/me/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    router.refresh();
  }

  const titles = ["About you", "Divisions you've raced", "Races you're planning"];
  const subtitles = [
    "The basics that power your training reports.",
    "Pick the divisions you've competed in and add your personal best for each.",
    "Pick the upcoming races you plan to attend, then the divisions for each.",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Header + progress */}
        <div className="px-7 pt-7 pb-3">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-semibold tracking-tight">Welcome, {firstName} 👋</div>
            <div className="text-xs text-muted tabular-nums">Step {step} of 3</div>
          </div>
          <div className="flex gap-1.5 mt-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-foreground" : "bg-border"}`} />
            ))}
          </div>
          <div className="mt-4">
            <div className="text-lg font-semibold">{titles[step - 1]}</div>
            <p className="text-sm text-muted mt-0.5">{subtitles[step - 1]}</p>
          </div>
        </div>

        <div className="px-7 pb-3 min-h-[16rem]">
          {/* STEP 1 — basics */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gender">
                <select value={basics.gender} onChange={(e) => setB("gender", e.target.value)} className="ob-input">
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
              <Field label="Age">
                <input value={basics.age} onChange={(e) => setB("age", e.target.value)} type="number" min={10} max={100} placeholder="years" className="ob-input" />
              </Field>
              <Field label="Height (cm)">
                <input value={basics.heightCm} onChange={(e) => setB("heightCm", e.target.value)} type="number" min={100} max={250} placeholder="cm" className="ob-input" />
              </Field>
              <Field label="Weight (kg)">
                <input value={basics.weightKg} onChange={(e) => setB("weightKg", e.target.value)} type="number" min={30} max={250} step="0.1" placeholder="kg" className="ob-input" />
              </Field>
              <Field label="Phone (optional)">
                <input value={basics.phone} onChange={(e) => setB("phone", e.target.value)} type="tel" placeholder="for your coach" className="ob-input" />
              </Field>
            </div>
          )}

          {/* STEP 2 — finished divisions + PB, or "no races yet" */}
          {step === 2 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  const next = !noRaces;
                  setNoRaces(next);
                  if (next) setFinished(emptyDivs()); // clear any picks
                }}
                className={`w-full rounded-xl border px-3 py-2.5 flex items-center gap-2.5 text-left transition ${
                  noRaces ? "border-foreground/40 bg-background" : "border-border"
                }`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${noRaces ? "bg-foreground text-white border-foreground" : "border-border"}`}>
                  {noRaces ? "✓" : ""}
                </span>
                <span className="text-sm font-medium">I haven&apos;t raced a Hyrox yet</span>
              </button>
              {!noRaces && (
                <DivisionPicker
                  map={finished}
                  onToggle={(d) => { setNoRaces(false); toggle(finished, setFinished, d); }}
                  onTime={(d, k, v) => setTime(finished, setFinished, d, k, v)}
                  timeLabel="Personal best"
                />
              )}
            </div>
          )}

          {/* STEP 3 — pick upcoming races, then divisions per race */}
          {step === 3 && (
            <div className="space-y-2 max-h-[20rem] overflow-y-auto -mx-1 px-1">
              {UPCOMING_RACES.map((r) => {
                const on = r.id in plans;
                const divs = plans[r.id] ?? [];
                return (
                  <div key={r.id} className={`rounded-xl border px-3 py-2.5 transition ${on ? "border-foreground/40 bg-background" : "border-border"}`}>
                    <button type="button" onClick={() => toggleRace(r.id)} className="flex items-center gap-2.5 w-full text-left">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${on ? "bg-foreground text-white border-foreground" : "border-border"}`}>
                        {on ? "✓" : ""}
                      </span>
                      <span className="text-sm font-medium">{r.city}</span>
                      <span className="text-xs text-muted">{r.dates}</span>
                    </button>
                    {on && (
                      <div className="mt-2.5 pl-6 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted mr-0.5">Divisions:</span>
                        {DIVISIONS.map((d) => {
                          const sel = divs.includes(d.value);
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => toggleRaceDivision(r.id, d.value)}
                              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                                sel ? "bg-foreground text-white border-foreground" : "bg-white border-border hover:border-foreground/40"
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step > 1 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="text-sm text-muted hover:text-foreground">← Back</button>
            ) : (
              <span />
            )}
            <button type="button" disabled={saving} onClick={finish} className="text-sm text-muted hover:text-foreground disabled:opacity-50">
              Skip for now
            </button>
          </div>
          {step < 3 ? (
            <button type="button" onClick={() => setStep(step + 1)} className="rounded-lg bg-foreground text-white px-5 py-2.5 text-sm font-medium hover:opacity-90">
              Next →
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={finish} className="rounded-lg bg-foreground text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : "Finish"}
            </button>
          )}
        </div>
      </div>

      <style>{`.ob-input{width:100%;border-radius:0.5rem;border:1px solid var(--border,#e5e7eb);background:#fff;padding:0.5rem 0.625rem;font-size:0.875rem;outline:none}`}</style>
    </div>
  );
}

function DivisionPicker({
  map,
  onToggle,
  onTime,
  timeLabel,
}: {
  map: Record<string, DivEntry>;
  onToggle: (d: string) => void;
  onTime: (d: string, k: "min" | "sec", v: string) => void;
  timeLabel: string;
}) {
  return (
    <div className="space-y-2">
      {DIVISIONS.map((d) => {
        const e = map[d.value];
        return (
          <div key={d.value} className={`rounded-xl border px-3 py-2.5 transition ${e.on ? "border-foreground/40 bg-background" : "border-border"}`}>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onToggle(d.value)}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${e.on ? "bg-foreground text-white border-foreground" : "border-border"}`}>
                  {e.on ? "✓" : ""}
                </span>
                {d.label}
              </button>
              {e.on && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted">{timeLabel}</span>
                  <input value={e.min} onChange={(ev) => onTime(d.value, "min", ev.target.value)} type="number" min={0} max={300} placeholder="min" className="ob-input w-16 py-1" />
                  <span className="text-muted text-sm">:</span>
                  <input value={e.sec} onChange={(ev) => onTime(d.value, "sec", ev.target.value)} type="number" min={0} max={59} placeholder="sec" className="ob-input w-16 py-1" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
