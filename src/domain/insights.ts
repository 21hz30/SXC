/**
 * Per-customer AI coaching insights.
 *
 * A coach clicks "Generate" on a customer's profile; we gather the athlete's
 * data (profile, benchmarks, races + goals, recent class performance, training
 * adherence, mock tests, attendance) and ask the AI for a small set of
 * structured insight cards — strengths, watch-outs, focus, and a nutrition tip.
 *
 * Output is JSON (not markdown) so the UI renders clean cards. Generated on
 * demand and cached client-side; nothing is stored server-side.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getAIClient, getAIModel } from "@/lib/ai";
import { getPrompt } from "./prompts";
import { divisionLabel, genderLabel, benchmarkLabel } from "./benchmarks";
import { formatSec, formatDate } from "@/lib/utils";

export type CustomerInsights = {
  headline: string;
  strengths: string[];
  watchOuts: string[];
  focus: string[];
  nutrition: string;
};

const FALLBACK_PROMPT =
  "You are an elite Hyrox coach analysing ONE athlete's data for their coach. " +
  "Reply with ONLY a JSON object (no prose, no code fence) with exactly these keys: " +
  "headline (string — one-line read on where they are right now), " +
  "strengths (array of 2-4 short bullets), " +
  "watchOuts (array of 2-4 short bullets — weak stations, high fatigue/RPE, injuries, missed sessions), " +
  "focus (array of 2-4 short coaching priorities for the next training block), " +
  "nutrition (string — 2-3 sentences of practical meal/fuelling guidance for their goal, body, and training load). " +
  "Be specific and reference their actual numbers and trends. Keep every bullet under ~16 words.";

async function buildContext(customerId: string): Promise<string> {
  const c = await db.customer.findUnique({
    where: { id: customerId, deletedAt: null },
    include: {
      benchmarks: { orderBy: { testedAt: "desc" }, take: 14 },
      raceResults: { orderBy: { eventDate: "desc" }, take: 5 },
      raceGoals: { orderBy: { updatedAt: "desc" } },
      rosterEntries: true,
      performances: { include: { class: { select: { title: true, startsAt: true } } }, orderBy: { class: { startsAt: "desc" } }, take: 10 },
      mockResults: { include: { class: { select: { title: true, startsAt: true } } }, orderBy: { recordedAt: "desc" }, take: 3 },
    },
  });
  if (!c) throw new Error("customer not found");
  const assignments = await db.workoutAssignment.findMany({
    where: { customerId },
    orderBy: { scheduledDate: "desc" },
    take: 40,
    include: { workout: { select: { name: true } } },
  });

  const L: string[] = [];
  L.push(`# Athlete: ${c.name}`);
  L.push(`Gender: ${genderLabel(c.gender)} · Divisions: ${c.division ? c.division.split(",").map((d) => divisionLabel(d.trim())).filter(Boolean).join(", ") : "—"}`);
  L.push(`Age: ${c.age ?? "—"} · Height: ${c.heightCm ?? "—"}cm · Weight: ${c.weightKg ?? "—"}kg · Hyrox PB: ${c.hyroxPbSec != null ? formatSec(c.hyroxPbSec) : "—"}`);
  if (c.notes?.trim()) L.push(`Coach notes: ${c.notes.trim()}`);

  const attended = c.rosterEntries.filter((r) => r.attendance === "attended").length;
  const marked = c.rosterEntries.filter((r) => r.attendance !== "pending").length;
  L.push(`\n## Attendance: ${attended}/${marked} marked classes`);

  L.push(`\n## Benchmarks (most recent)`);
  if (c.benchmarks.length === 0) L.push("(none on file)");
  else for (const b of c.benchmarks) L.push(`- ${benchmarkLabel(b.metric)}: ${b.metric.endsWith("_sec") ? formatSec(b.value) : `${b.value} ${b.unit}`}`);

  L.push(`\n## Races`);
  if (c.raceResults.length === 0) L.push("(no race results logged)");
  else for (const r of c.raceResults) L.push(`- ${formatDate(r.eventDate)} ${r.eventName} (${divisionLabel(r.division)}): total ${formatSec(r.totalSec)}${r.roxzoneSec != null ? `, roxzone ${formatSec(r.roxzoneSec)}` : ""}`);
  if (c.raceGoals.length) {
    L.push(`Goals:`);
    for (const g of c.raceGoals) L.push(`- ${divisionLabel(g.division)}: target ${g.targetTotalSec != null ? formatSec(g.targetTotalSec) : "—"}${g.targetDate ? ` by ${formatDate(g.targetDate)}` : ""}`);
  }

  L.push(`\n## Recent class performance (RPE / feeling / fatigue / injury)`);
  if (c.performances.length === 0) L.push("(none logged)");
  else for (const p of c.performances) {
    const bits = [
      `status ${p.status}`,
      p.rpe != null ? `RPE ${p.rpe}/10` : null,
      p.fatiguePct != null ? `fatigue ${p.fatiguePct}%` : null,
      p.feeling ? `feeling "${p.feeling}"` : null,
      p.injuryNote?.trim() ? `INJURY: ${p.injuryNote.trim()}` : null,
    ].filter(Boolean).join(", ");
    L.push(`- ${formatDate(p.class.startsAt)} ${p.class.title}: ${bits}`);
  }

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const due = assignments.filter((a) => a.scheduledDate && new Date(a.scheduledDate) <= todayEnd);
  const done = due.filter((a) => a.status === "completed").length;
  const missed = due.filter((a) => a.status !== "completed" && a.status !== "skipped").length;
  L.push(`\n## Training-plan adherence: ${done}/${due.length} due workouts done, ${missed} missed`);
  for (const a of assignments.filter((a) => a.status === "completed" && (a.rpe != null || a.feeling)).slice(0, 6)) {
    L.push(`- ${a.scheduledDate ? formatDate(a.scheduledDate) : ""} ${a.workout.name}: ${[a.rpe != null ? `RPE ${a.rpe}` : null, a.feeling].filter(Boolean).join(" ")}`);
  }

  if (c.mockResults.length) {
    L.push(`\n## Mock tests`);
    for (const m of c.mockResults) {
      let splits = 0;
      try { splits = m.timesJson ? Object.keys(JSON.parse(m.timesJson) as Record<string, number>).length : 0; } catch {}
      L.push(`- ${formatDate(m.class.startsAt)} ${m.class.title}: total ${m.totalSec != null ? formatSec(m.totalSec) : "—"}${splits ? `, ${splits} station splits` : ""}`);
    }
  }

  return L.join("\n");
}

function parseInsights(text: string): CustomerInsights {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  else {
    const i = raw.indexOf("{");
    const j = raw.lastIndexOf("}");
    if (i >= 0 && j > i) raw = raw.slice(i, j + 1);
  }
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : []);
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      headline: typeof o.headline === "string" ? o.headline : "",
      strengths: arr(o.strengths),
      watchOuts: arr(o.watchOuts),
      focus: arr(o.focus),
      nutrition: typeof o.nutrition === "string" ? o.nutrition : "",
    };
  } catch {
    return { headline: text.slice(0, 240).trim(), strengths: [], watchOuts: [], focus: [], nutrition: "" };
  }
}

export async function generateCustomerInsights(customerId: string): Promise<{ insights: CustomerInsights; model: string }> {
  const client = getAIClient();
  const model = getAIModel();
  const system = (await getPrompt("insights.customer")) || FALLBACK_PROMPT;
  const context = await buildContext(customerId);
  const resp = await client.messages.create({
    model,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: "Analyse this athlete and return the JSON insight object described in the system prompt.\n\n" + context }],
  });
  const text = resp.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("model returned empty insights");
  return { insights: parseInsights(text), model };
}
