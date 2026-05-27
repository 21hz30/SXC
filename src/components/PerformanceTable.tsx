"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export type Member = { customerId: string; name: string };
export type Exercise = { id: string; label: string };
export type PerfRow = {
  customerId: string;
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

function blankRow(customerId: string): PerfRow {
  return {
    customerId,
    status: "pending",
    rpe: null,
    fatiguePct: null,
    feeling: null,
    injuryNote: null,
    notes: null,
    results: {},
  };
}

export default function PerformanceTable({
  classId,
  members,
  exercises,
  initial,
}: {
  classId: string;
  members: Member[];
  exercises: Exercise[];
  initial: PerfRow[];
}) {
  const [rows, setRows] = useState<Record<string, PerfRow>>(() => {
    const map: Record<string, PerfRow> = {};
    for (const m of members) {
      const existing = initial.find((p) => p.customerId === m.customerId);
      map[m.customerId] = existing ?? blankRow(m.customerId);
    }
    return map;
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // When the roster changes (a member added/removed on the class page), make
  // sure every member has a row so the table never reads from `undefined`.
  const memberIdsKey = members.map((m) => m.customerId).join(",");
  useEffect(() => {
    setRows((cur) => {
      const map = { ...cur };
      for (const m of members) {
        if (!map[m.customerId]) {
          const existing = initial.find((p) => p.customerId === m.customerId);
          map[m.customerId] = existing ?? blankRow(m.customerId);
        }
      }
      return map;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIdsKey]);

  async function patch(customerId: string, fields: Partial<PerfRow>) {
    setRows((cur) => ({ ...cur, [customerId]: { ...cur[customerId], ...fields } }));
    setSavingId(customerId);
    await fetch(`/api/class/${classId}/performance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, ...fields }),
    });
    setSavingId(null);
  }

  function setResult(customerId: string, exId: string, val: string) {
    const results = { ...(rows[customerId]?.results ?? {}), [exId]: val };
    patch(customerId, { results });
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background text-muted text-xs uppercase tracking-wide">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Athlete</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">RPE</th>
              <th className="px-3 py-3 font-medium">Fatigue</th>
              <th className="px-3 py-3 font-medium">Feeling</th>
              <th className="px-3 py-3 font-medium">Injury</th>
              <th className="px-3 py-3 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => {
              const r = rows[m.customerId] ?? blankRow(m.customerId);
              const highFatigue = (r.fatiguePct ?? 0) >= 80;
              const hasInjury = !!r.injuryNote?.trim();
              const isOpen = expanded === m.customerId;
              return (
                <FragmentRow key={m.customerId}>
                  <tr className={hasInjury ? "bg-red-50" : highFatigue ? "bg-amber-50" : ""}>
                    <td className="px-4 py-2.5">
                      <Link href={`/customers/${m.customerId}`} className="font-medium hover:text-accent">{m.name}</Link>
                      {savingId === m.customerId && <span className="text-[10px] text-muted ml-1">saving…</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={r.status}
                        onChange={(e) => patch(m.customerId, { status: e.target.value })}
                        className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                      >
                        {STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number" min={1} max={10}
                        value={r.rpe ?? ""}
                        onChange={(e) => patch(m.customerId, { rpe: e.target.value ? Number(e.target.value) : null })}
                        placeholder="1–10"
                        className="w-16 rounded-md border border-border px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min={0} max={100}
                          value={r.fatiguePct ?? ""}
                          onChange={(e) => patch(m.customerId, { fatiguePct: e.target.value ? Number(e.target.value) : null })}
                          placeholder="0–100"
                          className={`w-16 rounded-md border px-2 py-1 text-xs ${highFatigue ? "border-amber-400 text-amber-700 font-semibold" : "border-border"}`}
                        />
                        <span className="text-xs text-muted">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={r.feeling ?? ""}
                        onChange={(e) => setRows((c) => ({ ...c, [m.customerId]: { ...c[m.customerId], feeling: e.target.value } }))}
                        onBlur={(e) => patch(m.customerId, { feeling: e.target.value || null })}
                        placeholder="legs heavy…"
                        className="w-28 rounded-md border border-border px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {hasInjury && <AlertTriangle size={13} className="text-red-600 shrink-0" />}
                        <input
                          value={r.injuryNote ?? ""}
                          onChange={(e) => setRows((c) => ({ ...c, [m.customerId]: { ...c[m.customerId], injuryNote: e.target.value } }))}
                          onBlur={(e) => patch(m.customerId, { injuryNote: e.target.value || null })}
                          placeholder="none"
                          className={`w-32 rounded-md border px-2 py-1 text-xs ${hasInjury ? "border-red-300 text-red-700" : "border-border"}`}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      {exercises.length > 0 && (
                        <button onClick={() => setExpanded(isOpen ? null : m.customerId)} className="text-muted hover:text-foreground" title="Per-exercise log">
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-background">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Per-exercise achieved — {m.name}</div>
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
                          <label className="text-xs text-muted">Session notes</label>
                          <input
                            defaultValue={r.notes ?? ""}
                            onBlur={(e) => patch(m.customerId, { notes: e.target.value || null })}
                            placeholder="anything worth noting for next session…"
                            className="w-full rounded-md border border-border px-2 py-1.5 text-sm mt-1"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
            {members.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-muted">No athletes on the roster.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[11px] text-muted border-t border-border bg-background">
        Rows turn <span className="text-amber-700 font-medium">amber</span> at ≥80% fatigue and <span className="text-red-600 font-medium">red</span> when an injury note is set — quick scan for recovery &amp; injury risk.
      </div>
    </div>
  );
}

// Helper so we can return two <tr> per member without an extra DOM wrapper
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
