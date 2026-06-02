"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Watch, HeartPulse } from "lucide-react";

export type WatchMember = { customerId: string; name: string };

export type WatchRow = {
  customerId: string;
  durationSec: number | null;
  distanceM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  caloriesKcal: number | null;
  avgCadence: number | null;
  zone1Sec: number | null;
  zone2Sec: number | null;
  zone3Sec: number | null;
  zone4Sec: number | null;
  zone5Sec: number | null;
  source: string;
  notes: string | null;
};

const SOURCES = ["manual", "garmin", "apple", "whoop", "polar"];

function blank(customerId: string): WatchRow {
  return {
    customerId,
    durationSec: null, distanceM: null, avgHr: null, maxHr: null,
    caloriesKcal: null, avgCadence: null,
    zone1Sec: null, zone2Sec: null, zone3Sec: null, zone4Sec: null, zone5Sec: null,
    source: "manual", notes: null,
  };
}

// Convert "mm:ss" or plain seconds to seconds; blank -> null.
function toSec(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    return Number(m) * 60 + Number(sec || 0);
  }
  return Number(s);
}
function fmtSec(n: number | null): string {
  if (n == null) return "";
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Per-class sport-watch data entry, one collapsible row per rostered athlete.
 * Headline metrics inline; HR-zone breakdown revealed on expand. Saves to
 * /api/class/[id]/watch on blur. Feeds the post-class report.
 */
export default function WatchDataPanel({
  classId,
  members,
  initial,
}: {
  classId: string;
  members: WatchMember[];
  initial: WatchRow[];
}) {
  const [rows, setRows] = useState<Record<string, WatchRow>>(() => {
    const map: Record<string, WatchRow> = {};
    for (const m of members) {
      map[m.customerId] = initial.find((r) => r.customerId === m.customerId) ?? blank(m.customerId);
    }
    return map;
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function patch(customerId: string, fields: Partial<WatchRow>) {
    setRows((cur) => ({ ...cur, [customerId]: { ...cur[customerId], ...fields } }));
    setSavingId(customerId);
    await fetch(`/api/class/${classId}/watch`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, ...fields }),
    });
    setSavingId(null);
  }

  if (members.length === 0) {
    return (
      <div className="text-sm text-muted px-2 py-6 text-center">
        Add athletes to the roster to record watch data.
      </div>
    );
  }

  return (
    <div>
      <div className="bg-background/40 px-3 py-2 text-[10px] font-medium text-muted uppercase tracking-wide grid grid-cols-12 gap-2">
        <div className="col-span-3">Athlete</div>
        <div className="col-span-2">Avg HR</div>
        <div className="col-span-2">Max HR</div>
        <div className="col-span-2">Time</div>
        <div className="col-span-2">Calories</div>
        <div className="col-span-1">Source</div>
      </div>
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const r = rows[m.customerId] ?? blank(m.customerId);
          const isOpen = expanded === m.customerId;
          const hasData = r.avgHr != null || r.maxHr != null || r.durationSec != null || r.caloriesKcal != null;
          return (
            <li key={m.customerId}>
              <div className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-sm">
                <div className="col-span-3 flex items-center gap-1">
                  <button
                    onClick={() => setExpanded(isOpen ? null : m.customerId)}
                    className="text-muted hover:text-foreground shrink-0"
                    title="HR zones & details"
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {hasData ? <HeartPulse size={13} className="text-rose-500 shrink-0" /> : <Watch size={13} className="text-muted shrink-0" />}
                  <span className="font-medium truncate">{m.name}</span>
                  {savingId === m.customerId && <span className="text-[10px] text-muted">saving…</span>}
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  <input
                    type="number" min={30} max={250}
                    defaultValue={r.avgHr ?? ""}
                    onBlur={(e) => patch(m.customerId, { avgHr: e.target.value ? Number(e.target.value) : null })}
                    placeholder="bpm"
                    className="w-full rounded-md border border-border px-1.5 py-1 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number" min={30} max={250}
                    defaultValue={r.maxHr ?? ""}
                    onBlur={(e) => patch(m.customerId, { maxHr: e.target.value ? Number(e.target.value) : null })}
                    placeholder="bpm"
                    className="w-full rounded-md border border-border px-1.5 py-1 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    defaultValue={fmtSec(r.durationSec)}
                    onBlur={(e) => patch(m.customerId, { durationSec: toSec(e.target.value) })}
                    placeholder="mm:ss"
                    className="w-full rounded-md border border-border px-1.5 py-1 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number" min={0}
                    defaultValue={r.caloriesKcal ?? ""}
                    onBlur={(e) => patch(m.customerId, { caloriesKcal: e.target.value ? Number(e.target.value) : null })}
                    placeholder="kcal"
                    className="w-full rounded-md border border-border px-1.5 py-1 text-xs"
                  />
                </div>
                <div className="col-span-1">
                  <select
                    value={r.source}
                    onChange={(e) => patch(m.customerId, { source: e.target.value })}
                    className="w-full rounded-md border border-border bg-white px-1 py-1 text-[11px]"
                  >
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {isOpen && (
                <div className="bg-background/60 px-3 py-3 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="Distance (m)">
                      <input type="number" min={0} defaultValue={r.distanceM ?? ""}
                        onBlur={(e) => patch(m.customerId, { distanceM: e.target.value ? Number(e.target.value) : null })}
                        placeholder="e.g. 5400" className="w-full rounded-md border border-border px-2 py-1 text-xs" />
                    </Field>
                    <Field label="Avg cadence (spm)">
                      <input type="number" min={0} defaultValue={r.avgCadence ?? ""}
                        onBlur={(e) => patch(m.customerId, { avgCadence: e.target.value ? Number(e.target.value) : null })}
                        placeholder="e.g. 168" className="w-full rounded-md border border-border px-2 py-1 text-xs" />
                    </Field>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-muted uppercase tracking-wide mb-1.5">
                      Time in HR zones (mm:ss)
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {([1, 2, 3, 4, 5] as const).map((z) => {
                        const key = `zone${z}Sec` as const;
                        return (
                          <Field key={z} label={`Z${z}`}>
                            <input
                              defaultValue={fmtSec(r[key])}
                              onBlur={(e) => patch(m.customerId, { [key]: toSec(e.target.value) } as Partial<WatchRow>)}
                              placeholder="0:00"
                              className="w-full rounded-md border border-border px-1.5 py-1 text-xs"
                            />
                          </Field>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted">Notes (device, anomalies…)</label>
                    <input
                      defaultValue={r.notes ?? ""}
                      onBlur={(e) => patch(m.customerId, { notes: e.target.value || null })}
                      placeholder="e.g. strap dropped out mid-row"
                      className="w-full rounded-md border border-border px-2 py-1.5 text-sm mt-1"
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-muted mb-0.5">{label}</label>
      {children}
    </div>
  );
}
