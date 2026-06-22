import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { findRace } from "@/domain/races";
import { findCoachByCode, connectByCode } from "@/domain/coachConnections";

type DivPB = { division: string; pbSec?: number | null };
type RacePlanInput = { raceId: string; division: string };

/**
 * Save the multi-step onboarding wizard for the caller's own profile and mark
 * it complete. Always sets `onboardedAt` so onboarding won't reappear — even
 * on skip we don't nag again.
 *
 * Beyond the flat profile fields, this seeds the Race data the rest of the app
 * derives from:
 *   - `finished[]` (divisions raced + PB) → one RaceResult per division
 *   - `goals[]`    (next-race divisions + target) → one RaceGoal per division
 */
export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { customerId: true },
  });
  if (!u?.customerId) return Response.json({ ok: false, message: "no profile" }, { status: 400 });
  const customerId = u.customerId;

  const body = (await req.json()) as Record<string, unknown>;
  const str = (k: string) => {
    const v = body[k];
    if (v == null) return undefined;
    const s = String(v).trim();
    return s || null;
  };
  const num = (k: string) => {
    const v = body[k];
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const finished = (Array.isArray(body.finished) ? body.finished : []) as DivPB[];
  const plans = (Array.isArray(body.racePlans) ? body.racePlans : []) as RacePlanInput[];

  // Resolve each planned race against the curated schedule (ignore unknown ids).
  const resolvedPlans = plans
    .map((p) => ({ race: findRace(p.raceId), division: p.division }))
    .filter((p): p is { race: NonNullable<ReturnType<typeof findRace>>; division: string } => !!p.race && !!p.division);

  // Next-race date = the earliest race the athlete plans to attend.
  const earliest = resolvedPlans
    .map((p) => new Date(p.race.start))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  // The athlete's divisions = everything they've raced or plan to race.
  const allDivisions = Array.from(
    new Set([...finished.map((f) => f.division), ...resolvedPlans.map((p) => p.division)].filter(Boolean)),
  );

  // 1) Flat profile fields.
  const data: Record<string, unknown> = { onboardedAt: new Date() };
  const gender = str("gender"); if (gender !== undefined) data.gender = gender;
  const age = num("age"); if (age !== undefined) data.age = age;
  const heightCm = num("heightCm"); if (heightCm !== undefined) data.heightCm = heightCm;
  const weightKg = num("weightKg"); if (weightKg !== undefined) data.weightKg = weightKg;
  // Phone is captured at sign-up now; onboarding collects email + coach code.
  const email = str("email"); if (email !== undefined) data.email = email;
  if (allDivisions.length) data.division = allDivisions.join(",");
  if (earliest) data.goalRaceDate = earliest;
  await db.customer.update({ where: { id: customerId }, data });

  // Optional: connect to a coach via the invitation code entered in onboarding.
  // Idempotent (connectByCode no-ops if already connected/pending) and a bad
  // code is ignored, so onboarding never blocks on a typo or stale link.
  const coachCode = str("coachCode");
  if (coachCode && (await findCoachByCode(coachCode))) {
    await connectByCode(customerId, coachCode);
  }

  // 2) PB per finished division → a RaceResult (the canonical PB source).
  for (const f of finished) {
    if (!f.division || !f.pbSec) continue;
    await db.raceResult.create({
      data: {
        customerId,
        eventName: "Personal best",
        eventDate: new Date(),
        division: f.division,
        totalSec: Math.round(Number(f.pbSec)),
        notes: "Added during onboarding",
      },
    });
  }

  // 3) Planned races → RacePlan rows (one per race+division).
  for (const p of resolvedPlans) {
    await db.racePlan.upsert({
      where: { customerId_raceId_division: { customerId, raceId: p.race.id, division: p.division } },
      create: {
        customerId,
        raceId: p.race.id,
        raceName: p.race.city,
        raceDate: new Date(p.race.start),
        division: p.division,
      },
      update: { raceName: p.race.city, raceDate: new Date(p.race.start) },
    });
  }

  return Response.json({ ok: true });
}
