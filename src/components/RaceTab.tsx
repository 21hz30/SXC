"use client";

import { useMemo, useState } from "react";
import Sparkline from "./Sparkline";
import RadarChart, { type RadarPoint } from "./RadarChart";
import {
  STATION_KEYS,
  STATION_LABELS,
  RUN_KEYS,
  type RaceSplitFields,
  getStandardSet,
  pbByDivision,
  pbByStation,
  avgRunSec,
  ratio,
  type RadarMode,
} from "@/domain/races";
import { divisionLabel, DIVISIONS } from "@/domain/benchmarks";
import { formatSec } from "@/lib/utils";

export type RaceDTO = RaceSplitFields & {
  id: string;
  eventName: string;
  eventDate: string; // ISO
  division: string;
  notes: string | null;
};

export type GoalDTO = {
  division: string;
  targetTotalSec: number | null;
  targetDate: string | null;
  targetSkiSec: number | null;
  targetSledPushSec: number | null;
  targetSledPullSec: number | null;
  targetBurpeeSec: number | null;
  targetRowSec: number | null;
  targetFarmersSec: number | null;
  targetLungesSec: number | null;
  targetWallballsSec: number | null;
  targetRunSec: number | null;
};

export default function RaceTab({
  races,
  goals,
  gender,
}: {
  races: RaceDTO[];
  goals: GoalDTO[];
  gender: string | null;
}) {
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(races[0]?.id ?? null);
  const [radarMode, setRadarMode] = useState<RadarMode>("pb");
  const [filterDivision, setFilterDivision] = useState<string | "all">("all");

  const filteredRaces = filterDivision === "all" ? races : races.filter((r) => r.division === filterDivision);
  const selectedRace = filteredRaces.find((r) => r.id === selectedRaceId) ?? filteredRaces[0] ?? null;

  const pbDiv = useMemo(() => pbByDivision(races), [races]);
  const pbStn = useMemo(() => pbByStation(races), [races]);

  // Build the radar points for the selected race vs the chosen benchmark.
  const radarPoints: RadarPoint[] = useMemo(() => {
    if (!selectedRace) return [];
    const goal = goals.find((g) => g.division === selectedRace.division);
    const standard = getStandardSet(selectedRace.division, gender);

    function benchmarkFor(stationKey: typeof STATION_KEYS[number]): number | null {
      if (radarMode === "pb") return pbStn[stationKey];
      if (radarMode === "standard") return standard[stationKey];
      // goal
      const g = goal?.[`target${stationKey[0].toUpperCase()}${stationKey.slice(1)}Sec` as keyof GoalDTO];
      return typeof g === "number" ? g : null;
    }

    const stationPts: RadarPoint[] = STATION_KEYS.map((k) => ({
      label: STATION_LABELS[k],
      ratio: ratio(selectedRace[`${k}Sec` as keyof RaceSplitFields] as number | null, benchmarkFor(k)),
    }));

    // Average run axis
    const raceAvgRun = avgRunSec(selectedRace);
    let runBench: number | null = null;
    if (radarMode === "pb") {
      // best avg run across athlete's history
      const allAvgs = races.map(avgRunSec).filter((x): x is number => x != null);
      runBench = allAvgs.length ? Math.min(...allAvgs) : null;
    } else if (radarMode === "standard") {
      runBench = standard.runSec;
    } else {
      runBench = goal?.targetRunSec ?? null;
    }
    return [...stationPts, { label: "Avg Run", ratio: ratio(raceAvgRun, runBench) }];
  }, [selectedRace, radarMode, pbStn, goals, gender, races]);

  // Run-speed sparkline data (the 8 run splits in order).
  const runPoints = useMemo(() => {
    if (!selectedRace) return [];
    return RUN_KEYS.map((k, i) => {
      const v = selectedRace[`${k}Sec` as keyof RaceSplitFields] as number | null;
      return v != null ? { x: i + 1, y: v, label: `Run ${i + 1}` } : null;
    }).filter((p): p is { x: number; y: number; label: string } => p !== null);
  }, [selectedRace]);

  if (races.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted">
        No races logged yet. Use the &quot;Log race result&quot; form below to add one.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PB strip per division */}
      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">Personal Bests by Division</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(pbDiv).map(([div, sec]) => (
            <button
              key={div}
              onClick={() => { setFilterDivision(div); setSelectedRaceId(races.find((r) => r.division === div)?.id ?? null); }}
              className={`rounded-xl border px-4 py-2.5 text-left transition ${filterDivision === div ? "border-accent bg-orange-50" : "border-border bg-card hover:border-accent"}`}
            >
              <div className="text-[11px] text-muted uppercase tracking-wide">{divisionLabel(div)}</div>
              <div className="text-lg font-semibold tabular-nums">{formatSec(sec)}</div>
            </button>
          ))}
          <button
            onClick={() => setFilterDivision("all")}
            className={`rounded-xl border px-3 py-2.5 text-xs text-muted ${filterDivision === "all" ? "border-accent" : "border-border"} hover:border-accent`}
          >
            All divisions
          </button>
        </div>
      </section>

      {/* Race history table */}
      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">
          Race history {filterDivision !== "all" && <span className="text-muted normal-case">· filtered by {divisionLabel(filterDivision)}</span>}
        </h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-background text-muted text-xs uppercase tracking-wide">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Division</th>
                <th className="px-3 py-2.5 font-medium text-right">Total</th>
                <th className="px-3 py-2.5 font-medium text-right">Roxzone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRaces.map((r) => {
                const isSelected = r.id === selectedRace?.id;
                const isPb = pbDiv[r.division] === r.totalSec;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRaceId(r.id)}
                    className={`cursor-pointer ${isSelected ? "bg-orange-50" : "hover:bg-background"}`}
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {r.eventName}
                      {isPb && <span className="ml-2 text-[10px] font-semibold text-orange-700 bg-orange-100 rounded px-1.5 py-0.5">PB</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{new Date(r.eventDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2.5 capitalize">{divisionLabel(r.division)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatSec(r.totalSec)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{r.roxzoneSec != null ? formatSec(r.roxzoneSec) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {selectedRace && (
        <>
          {/* Splits + run-speed for selected race */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-medium text-muted uppercase tracking-wide">Splits — {selectedRace.eventName}</h3>
                <div className="text-xs text-muted">{new Date(selectedRace.eventDate).toLocaleDateString()} · {divisionLabel(selectedRace.division)}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {RUN_KEYS.map((k, i) => {
                  const v = selectedRace[`${k}Sec` as keyof RaceSplitFields] as number | null;
                  return (
                    <div key={k} className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted">Run {i + 1}</span>
                      <span className="tabular-nums">{v != null ? formatSec(v) : "—"}</span>
                    </div>
                  );
                })}
                {STATION_KEYS.map((k) => {
                  const v = selectedRace[`${k}Sec` as keyof RaceSplitFields] as number | null;
                  return (
                    <div key={k} className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted">{STATION_LABELS[k]}</span>
                      <span className="tabular-nums">{v != null ? formatSec(v) : "—"}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted">Roxzone</span>
                  <span className="tabular-nums">{selectedRace.roxzoneSec != null ? formatSec(selectedRace.roxzoneSec) : "—"}</span>
                </div>
                <div className="flex justify-between font-semibold py-1.5 col-span-2 mt-2 border-t border-border">
                  <span>Total</span>
                  <span className="tabular-nums">{formatSec(selectedRace.totalSec)}</span>
                </div>
              </div>
              {selectedRace.notes && <div className="text-xs text-muted mt-3 italic">&ldquo;{selectedRace.notes}&rdquo;</div>}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">Run speed across the race</h3>
              <div className="text-xs text-muted mb-3">Lower = faster. Watch for late-race fade.</div>
              {runPoints.length > 0 ? (
                <Sparkline points={runPoints} height={180} />
              ) : (
                <div className="text-xs text-muted py-8 text-center">No run splits recorded for this race.</div>
              )}
            </div>
          </section>

          {/* Radar with benchmark toggle */}
          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-medium text-muted uppercase tracking-wide">Station radar</h3>
                <div className="text-xs text-muted mt-0.5">
                  This race vs benchmark. Closer to outer ring = faster than benchmark; closer to center = slower.
                </div>
              </div>
              <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                {(["pb", "standard", "goal"] as RadarMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRadarMode(m)}
                    className={`px-3 py-1.5 ${radarMode === m ? "bg-foreground text-white" : "bg-background text-muted hover:bg-card"}`}
                  >
                    {m === "pb" ? "vs Personal Best" : m === "standard" ? "vs Division Standard" : "vs Goal"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <RadarChart
                points={radarPoints}
                size={420}
                athleteLabel={selectedRace?.eventName ? `${selectedRace.eventName}` : "This race"}
                benchmarkLabel={radarMode === "pb" ? "Personal Best" : radarMode === "standard" ? `Division Standard (${divisionLabel(selectedRace.division)})` : "Goal"}
              />
            </div>
            {radarMode === "goal" && !goals.find((g) => g.division === selectedRace.division) && (
              <div className="text-xs text-amber-600 text-center mt-2">No goal set for {divisionLabel(selectedRace.division)} yet — set one below to populate this view.</div>
            )}
          </section>

          {/* Goals (read display; edit form rendered by parent) */}
          <section>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">Goals</h2>
            {goals.length === 0 ? (
              <div className="bg-card border border-border border-dashed rounded-xl p-4 text-sm text-muted text-center">
                No goals set yet. Use the form below to set per-division targets.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {goals.map((g) => (
                  <div key={g.division} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-sm font-semibold">{divisionLabel(g.division)}</div>
                      <div className="text-xs text-muted">{g.targetDate ? new Date(g.targetDate).toLocaleDateString() : "no date"}</div>
                    </div>
                    <div className="text-2xl font-semibold tabular-nums">{g.targetTotalSec != null ? formatSec(g.targetTotalSec) : "—"}</div>
                    <div className="text-[11px] text-muted mt-1">
                      Per-station targets {[g.targetSkiSec, g.targetSledPushSec, g.targetSledPullSec, g.targetBurpeeSec, g.targetRowSec, g.targetFarmersSec, g.targetLungesSec, g.targetWallballsSec, g.targetRunSec].filter((x) => x != null).length}/9 set
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export const DIVISIONS_EXPORT = DIVISIONS; // re-export so the parent edit form can use it
