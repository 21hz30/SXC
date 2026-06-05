/**
 * Sport-watch / wearable data for a class, scoped per athlete.
 *
 * One row per (class, customer). Stored separately from `ActivityData` (which
 * is date-based, free-floating cardio) because this is tied to a specific
 * class session and feeds the post-class report.
 */
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { Ctx } from "./types";

export type WatchDataDTO = {
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
  aerobicTE: number | null;
  anaerobicTE: number | null;
  exerciseLoad: number | null;
  restingCalories: number | null;
  activeCalories: number | null;
  sweatLossMl: number | null;
  source: string;
  notes: string | null;
};

// The numeric metric fields a client can PATCH. Keeps the API honest.
export const WATCH_NUMERIC_FIELDS = [
  "durationSec",
  "distanceM",
  "avgHr",
  "maxHr",
  "caloriesKcal",
  "avgCadence",
  "zone1Sec",
  "zone2Sec",
  "zone3Sec",
  "zone4Sec",
  "zone5Sec",
  "aerobicTE",
  "anaerobicTE",
  "exerciseLoad",
  "restingCalories",
  "activeCalories",
  "sweatLossMl",
] as const;

export async function listWatchData(_ctx: Ctx, classId: string): Promise<WatchDataDTO[]> {
  const rows = await db.classWatchData.findMany({ where: { classId } });
  return rows.map((r) => ({
    customerId: r.customerId,
    durationSec: r.durationSec,
    distanceM: r.distanceM,
    avgHr: r.avgHr,
    maxHr: r.maxHr,
    caloriesKcal: r.caloriesKcal,
    avgCadence: r.avgCadence,
    zone1Sec: r.zone1Sec,
    zone2Sec: r.zone2Sec,
    zone3Sec: r.zone3Sec,
    zone4Sec: r.zone4Sec,
    zone5Sec: r.zone5Sec,
    aerobicTE: r.aerobicTE,
    anaerobicTE: r.anaerobicTE,
    exerciseLoad: r.exerciseLoad,
    restingCalories: r.restingCalories,
    activeCalories: r.activeCalories,
    sweatLossMl: r.sweatLossMl,
    source: r.source,
    notes: r.notes,
  }));
}

export async function upsertWatchData(
  _ctx: Ctx,
  classId: string,
  customerId: string,
  input: Partial<{
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
    aerobicTE: number | null;
    anaerobicTE: number | null;
    exerciseLoad: number | null;
    restingCalories: number | null;
    activeCalories: number | null;
    sweatLossMl: number | null;
    source: string;
    notes: string | null;
  }>,
) {
  const data: Record<string, unknown> = {};
  for (const f of WATCH_NUMERIC_FIELDS) {
    if (input[f] !== undefined) data[f] = input[f];
  }
  if (input.source !== undefined) data.source = input.source;
  if (input.notes !== undefined) data.notes = input.notes;

  await db.classWatchData.upsert({
    where: { classId_customerId: { classId, customerId } },
    create: { classId, customerId, ...data },
    update: data,
  });
  revalidatePath(`/classes/${classId}`);
}
