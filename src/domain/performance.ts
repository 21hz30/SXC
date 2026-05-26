import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { Ctx } from "./types";

export type PerformanceDTO = {
  customerId: string;
  status: string;
  rpe: number | null;
  fatiguePct: number | null;
  feeling: string | null;
  injuryNote: string | null;
  notes: string | null;
  results: Record<string, string>;
};

export async function listPerformance(_ctx: Ctx, classId: string): Promise<PerformanceDTO[]> {
  const rows = await db.performance.findMany({ where: { classId } });
  return rows.map((r) => ({
    customerId: r.customerId,
    status: r.status,
    rpe: r.rpe,
    fatiguePct: r.fatiguePct,
    feeling: r.feeling,
    injuryNote: r.injuryNote,
    notes: r.notes,
    results: r.resultsJson ? (JSON.parse(r.resultsJson) as Record<string, string>) : {},
  }));
}

export async function upsertPerformance(
  _ctx: Ctx,
  classId: string,
  customerId: string,
  input: Partial<{
    status: string;
    rpe: number | null;
    fatiguePct: number | null;
    feeling: string | null;
    injuryNote: string | null;
    notes: string | null;
    results: Record<string, string>;
  }>
) {
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.rpe !== undefined) data.rpe = input.rpe;
  if (input.fatiguePct !== undefined) data.fatiguePct = input.fatiguePct;
  if (input.feeling !== undefined) data.feeling = input.feeling;
  if (input.injuryNote !== undefined) data.injuryNote = input.injuryNote;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.results !== undefined) data.resultsJson = JSON.stringify(input.results);

  await db.performance.upsert({
    where: { classId_customerId: { classId, customerId } },
    create: { classId, customerId, ...data },
    update: data,
  });
  revalidatePath(`/classes/${classId}`);
}
