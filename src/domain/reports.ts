/**
 * Post-class report generation.
 *
 * One report per (class, customer). Coach clicks "Generate" from the class
 * detail page; we collect the class plan, that athlete's logged performance,
 * their profile + race goal, and the date of their next scheduled class in
 * the same camp, then ask Claude to produce a markdown report.
 *
 * Coach can edit the markdown before publishing it to the athlete. Athletes
 * only see reports where `publishedAt` is set.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { formatItem } from "./exercises";
import { getPrompt } from "./prompts";
import { getAIClient, getAIModel } from "@/lib/ai";
import { formatDateLong } from "@/lib/utils";

const FALLBACK_PROMPT =
  "You are SXC, a Hyrox co-coach. Write a short markdown post-class report addressed " +
  "to the athlete, with H2 sections: What you did today, How it went, Plan for the " +
  "next days, Eat, Avoid, Watch-outs.";

async function getReportPrompt(): Promise<string> {
  const content = await getPrompt("report.postClass");
  return content || FALLBACK_PROMPT;
}

export type GeneratedReport = { contentMarkdown: string; model: string };

/**
 * Build the structured fact-block that gets stuffed into the user message.
 * Kept as plain text (not JSON) so the model treats it as a coach's briefing
 * note rather than a schema to echo back.
 */
async function buildContext(classId: string, customerId: string): Promise<string> {
  const cls = await db.class.findUnique({
    where: { id: classId },
    include: {
      camp: { select: { id: true, name: true, division: true } },
      workouts: {
        orderBy: { order: "asc" },
        include: { workout: { include: { items: { orderBy: { order: "asc" } } } } },
      },
    },
  });
  if (!cls) throw new Error("class not found");

  const customer = await db.customer.findUnique({
    where: { id: customerId, deletedAt: null },
    include: {
      raceGoals: { orderBy: { updatedAt: "desc" }, take: 1 },
      raceResults: { orderBy: { eventDate: "desc" }, take: 1 },
    },
  });
  if (!customer) throw new Error("customer not found");

  const performances = await db.performance.findMany({
    where: { classId, customerId },
  });
  const perfByWorkout = new Map(performances.map((p) => [p.workoutId, p]));

  const watch = await db.classWatchData.findUnique({
    where: { classId_customerId: { classId, customerId } },
  });

  // Find this athlete's next scheduled class in the same camp (or anywhere
  // if free-standing). Used so the day-by-day plan stops at the right place.
  const nextClass = await db.class.findFirst({
    where: {
      startsAt: { gt: cls.startsAt },
      roster: { some: { customerId } },
      ...(cls.campId ? { campId: cls.campId } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true },
  });

  const lines: string[] = [];
  lines.push(`# Class: ${cls.title}`);
  lines.push(`Date: ${formatDateLong(cls.startsAt)}`);
  if (cls.location) lines.push(`Location: ${cls.location}`);
  if (cls.camp) lines.push(`Camp: ${cls.camp.name} (${cls.camp.division})`);
  lines.push("");

  lines.push("## Workouts in this class");
  if (cls.workouts.length === 0) {
    lines.push("- (no workouts assigned)");
  } else {
    for (const cw of cls.workouts) {
      lines.push(`### ${cw.workout.name}`);
      if (cw.workout.description) lines.push(cw.workout.description);
      for (const it of cw.workout.items) {
        const { title, details } = formatItem(it as never);
        lines.push(`- ${title}${details ? ` — ${details}` : ""}`);
      }
      const perf = perfByWorkout.get(cw.workoutId);
      if (perf) {
        lines.push(`Athlete's result for this workout:`);
        lines.push(`  - status: ${perf.status}`);
        if (perf.rpe != null) lines.push(`  - RPE: ${perf.rpe}/10`);
        if (perf.fatiguePct != null) lines.push(`  - fatigue: ${perf.fatiguePct}%`);
        if (perf.feeling) lines.push(`  - felt: ${perf.feeling}`);
        if (perf.injuryNote) lines.push(`  - INJURY NOTE: ${perf.injuryNote}`);
        if (perf.notes) lines.push(`  - coach notes: ${perf.notes}`);
        if (perf.resultsJson) {
          const results = JSON.parse(perf.resultsJson) as Record<string, string>;
          const itemById = new Map(cw.workout.items.map((it) => [it.id, it]));
          for (const [itemId, val] of Object.entries(results)) {
            if (!val) continue;
            const it = itemById.get(itemId);
            const name = it ? formatItem(it as never).title : itemId;
            lines.push(`  - ${name}: achieved ${val}`);
          }
        }
      } else {
        lines.push(`Athlete did not log a result for this workout.`);
      }
      lines.push("");
    }
  }

  lines.push("## Athlete profile");
  lines.push(`Name: ${customer.name}`);
  if (customer.gender) lines.push(`Gender: ${customer.gender}`);
  if (customer.age) lines.push(`Age: ${customer.age}`);
  if (customer.weightKg) lines.push(`Weight: ${customer.weightKg} kg`);
  if (customer.heightCm) lines.push(`Height: ${customer.heightCm} cm`);
  if (customer.division) lines.push(`Division: ${customer.division}`);
  if (customer.goalRaceDate) lines.push(`Goal race date: ${formatDateLong(customer.goalRaceDate)}`);
  if (customer.hyroxPbSec) lines.push(`Hyrox PB: ${Math.floor(customer.hyroxPbSec / 60)}:${(customer.hyroxPbSec % 60).toString().padStart(2, "0")}`);
  if (customer.notes) lines.push(`Profile notes: ${customer.notes}`);

  const goal = customer.raceGoals[0];
  if (goal?.targetTotalSec) {
    const m = Math.floor(goal.targetTotalSec / 60);
    const s = goal.targetTotalSec % 60;
    lines.push(`Target total: ${m}:${s.toString().padStart(2, "0")} (${goal.division})`);
  }

  // Sport-watch data — real cardiac/load signal to ground the analysis.
  if (watch) {
    const fmtMin = (sec: number | null) =>
      sec == null ? null : `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
    const wl: string[] = [];
    if (watch.avgHr != null) wl.push(`avg HR ${watch.avgHr} bpm`);
    if (watch.maxHr != null) wl.push(`max HR ${watch.maxHr} bpm`);
    if (watch.durationSec != null) wl.push(`active time ${fmtMin(watch.durationSec)}`);
    if (watch.distanceM != null) wl.push(`distance ${(watch.distanceM / 1000).toFixed(2)} km`);
    if (watch.caloriesKcal != null) wl.push(`${watch.caloriesKcal} kcal`);
    if (watch.avgCadence != null) wl.push(`cadence ${watch.avgCadence} spm`);
    const zones = ([1, 2, 3, 4, 5] as const)
      .map((z) => {
        const v = watch[`zone${z}Sec` as const];
        return v != null ? `Z${z} ${fmtMin(v)}` : null;
      })
      .filter(Boolean);
    if (wl.length || zones.length) {
      lines.push("");
      lines.push(`## Sport-watch data (source: ${watch.source})`);
      if (wl.length) lines.push(wl.join(" · "));
      if (zones.length) lines.push(`Time in HR zones — ${zones.join(", ")}`);
      lines.push(
        "Use this to judge true intensity: a high avg HR or lots of Z4–Z5 time means " +
          "prioritise recovery even if RPE felt moderate; mostly Z1–Z2 means they can " +
          "train sooner.",
      );
      if (watch.notes) lines.push(`Watch notes: ${watch.notes}`);
    }
  }

  lines.push("");
  lines.push("## Schedule");
  if (nextClass) {
    lines.push(`Next class: "${nextClass.title}" on ${formatDateLong(nextClass.startsAt)}`);
    const daysUntil = Math.max(
      1,
      Math.ceil((nextClass.startsAt.getTime() - cls.startsAt.getTime()) / (1000 * 60 * 60 * 24)),
    );
    lines.push(`Days until next class: ${daysUntil}`);
  } else {
    lines.push(`No upcoming class scheduled. Default the plan to the next 5 days.`);
  }

  return lines.join("\n");
}

export async function generateClassReport(
  classId: string,
  customerId: string,
): Promise<GeneratedReport> {
  const client = getAIClient();
  const model = getAIModel();
  const [system, context] = await Promise.all([getReportPrompt(), buildContext(classId, customerId)]);

  const resp = await client.messages.create({
    model,
    max_tokens: 4000,
    system,
    messages: [
      {
        role: "user",
        content:
          "Write the post-class report for this athlete using the data below. " +
          "Follow the section structure from the system prompt exactly.\n\n" +
          context,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("model returned empty report");
  return { contentMarkdown: text, model };
}

export async function upsertReport(
  classId: string,
  customerId: string,
  contentMarkdown: string,
  model: string | null,
) {
  return db.classReport.upsert({
    where: { classId_customerId: { classId, customerId } },
    create: { classId, customerId, contentMarkdown, model: model ?? undefined },
    update: { contentMarkdown, model: model ?? undefined, publishedAt: null },
  });
}
