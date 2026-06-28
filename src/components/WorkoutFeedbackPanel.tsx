"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export type Member = { customerId: string; name: string };
export type Exercise = { id: string; label: string };

export type WorkoutPerfRow = {
  customerId: string;
  workoutId: string;
  status: string;
  rpe: number | null;
  fatiguePct: number | null;
  feeling: string | null;
  injuryNote: string | null;
  notes: string | null;
  results: Record<string, string>;
};

const STATUS_OPTS = [
  { v: "pending", label: "—" },
  { v: "completed", label: "Completed" },
  { v: "partial", label: "Partial" },
  { v: "dnf", label: "DNF" },
];

function blankRow(customerId: string, workoutId: string): WorkoutPerfRow {
  return {
    customerId, workoutId,
    status: "pending", rpe: null, fatiguePct: null,
    feeling: null, injuryNote: null, notes: null, results: {},
  };
}

function buildRows(
  members: Member[],
  initial: WorkoutPerfRow[],
  workoutId: string,
  current?: Record<string, WorkoutPerfRow>,
): Record<string, WorkoutPerfRow> {
  const map: Record<string, WorkoutPerfRow> = {};
  for (const m of members) {
    const existing = initial.find((p) => p.customerId === m.customerId);
    map[m.customerId] = current?.[m.customerId] ?? existing ?? blankRow(m.customerId, workoutId);
  }
  return map;
}

/**
 * Per-workout feedback table for one workout in a class. Each rostered athlete
 * gets a compact row to log status / RPE / fatigue / feeling / injury for THIS
 * workout (not the whole class). Expanding a row reveals per-exercise
 * achievement inputs scoped to this workout's stations.
 */
export default function WorkoutFeedbackPanel({
  classId,
  workoutId,
  members,
  exercises,
  initial,
}: {
  classId: string;
  workoutId: string;
  members: Member[];
  exercises: Exercise[];
  initial: WorkoutPerfRow[];
}) {
  // Resync rows when the roster set changes (e.g. an athlete added/removed).
  const memberIdsKey = members.map((m) => m.customerId).join(",");
  const [rowsKey, setRowsKey] = useState(memberIdsKey);
  const [rows, setRows] = useState<Record<string, WorkoutPerfRow>>(() => buildRows(members, initial, workoutId));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  if (memberIdsKey !== rowsKey) {
    setRowsKey(memberIdsKey);
    setRows((cur) => buildRows(members, initial, workoutId, cur));
  }

  async function patch(customerId: string, fields: Partial<WorkoutPerfRow>) {
    setRows((cur) => ({ ...cur, [customerId]: { ...cur[customerId], ...fields } }));
    setSavingId(customerId);
    await fetch(`/api/class/${classId}/performance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, workoutId, ...fields }),
    });
    setSavingId(null);
  }
  function setResult(customerId: string, exId: string, val: string) {
    const results = { ...(rows[customerId]?.results ?? {}), [exId]: val };
    patch(customerId, { results });
  }

  if (members.length === 0) {
    return <div className="text-xs text-muted italic px-2 py-3">No athletes on the roster yet.</div>;
  }

  return (
    <div className="border-t border-border">
      <div className="bg-background/40 px-3 py-2 text-[10px] font-medium text-muted uppercase tracking-wide grid grid-cols-12 gap-2">
        <div className="col-span-3">Athlete</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-1">RPE</div>
        <div className="col-span-2">Fatigue</div>
        <div className="col-span-2">Feeling</div>
        <div className="col-span-2">Injury</div>
      </div>
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const r = rows[m.customerId] ?? blankRow(m.customerId, workoutId);
          const highFatigue = (r.fatiguePct ?? 0) >= 80;
          const hasInjury = !!r.injuryNote?.trim();
          const isOpen = expanded === m.customerId;
          return (
            <li key={m.customerId} className={hasInjury ? "bg-red-50/40" : highFatigue ? "bg-amber-50/40" : ""}>
              <div className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-sm">
                <div className="col-span-3 flex items-center gap-1">
                  {exercises.length > 0 && (
                    <button onClick={() => setExpanded(isOpen ? null : m.customerId)} className="text-muted hover:text-foreground shrink-0" title="Per-exercise log">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  )}
                  <span className="font-medium truncate">{m.name}</span>
                  {savingId === m.customerId && <span className="text-[10px] text-muted">saving…</span>}
                </div>
                <div className="col-span-2">
                  <select
                    value={r.status}
                    onChange={(e) => patch(m.customerId, { status: e.target.value })}
                    className="w-full rounded-md border border-border bg-white px-1.5 py-1 text-xs"
                  >
                    {STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <input
                    type="number" min={1} max={10}
                    value={r.rpe ?? ""}
                    onChange={(e) => patch(m.customerId, { rpe: e.target.value ? Number(e.target.value) : null })}
                    placeholder="1–10"
                    className="w-full rounded-md border border-border px-1.5 py-1 text-xs"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  <input
                    type="number" min={0} max={100}
                    value={r.fatiguePct ?? ""}
                    onChange={(e) => patch(m.customerId, { fatiguePct: e.target.value ? Number(e.target.value) : null })}
                    placeholder="0–100"
                    className={`w-full rounded-md border px-1.5 py-1 text-xs ${highFatigue ? "border-amber-400 text-amber-700 font-semibold" : "border-border"}`}
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
                <div className="col-span-2">
                  <input
                    value={r.feeling ?? ""}
                    onChange={(e) => setRows((c) => ({ ...c, [m.customerId]: { ...c[m.customerId], feeling: e.target.value } }))}
                    onBlur={(e) => patch(m.customerId, { feeling: e.target.value || null })}
                    placeholder="legs heavy…"
                    className="w-full rounded-md border border-border px-1.5 py-1 text-xs"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  {hasInjury && <AlertTriangle size={12} className="text-red-600 shrink-0" />}
                  <input
                    value={r.injuryNote ?? ""}
                    onChange={(e) => setRows((c) => ({ ...c, [m.customerId]: { ...c[m.customerId], injuryNote: e.target.value } }))}
                    onBlur={(e) => patch(m.customerId, { injuryNote: e.target.value || null })}
                    placeholder="none"
                    className={`w-full rounded-md border px-1.5 py-1 text-xs ${hasInjury ? "border-red-300 text-red-700" : "border-border"}`}
                  />
                </div>
              </div>
              {isOpen && exercises.length > 0 && (
                <div className="bg-background/60 px-3 py-3">
                  <div className="text-[10px] font-medium text-muted uppercase tracking-wide mb-2">Per-exercise achieved</div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                    {exercises.map((ex) => (
                      <div key={ex.id} className="flex items-center gap-2">
                        <span className="text-xs text-muted flex-1 truncate" title={ex.label}>{ex.label}</span>
                        <input
                          defaultValue={r.results[ex.id] ?? ""}
                          onBlur={(e) => setResult(m.customerId, ex.id, e.target.value)}
                          placeholder="achieved"
                          className="w-24 rounded-md border border-border px-2 py-1 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-muted">Notes for this workout</label>
                    <input
                      defaultValue={r.notes ?? ""}
                      onBlur={(e) => patch(m.customerId, { notes: e.target.value || null })}
                      placeholder="anything worth noting…"
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
