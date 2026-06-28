import { Link } from "lucide-react";
import { itemTitle, itemChips, tagMeta, groupItems } from "@/domain/exercises";

/** Loose structural shape — accepts a Prisma WorkoutItem row as-is. */
export type ExerciseItem = {
  id?: string;
  category: string;
  label?: string | null;
  distanceM?: number | null;
  timeSec?: number | null;
  weightKg?: number | null;
  reps?: number | null;
  sets?: number | null;
  paceSecPerKm?: number | null;
  heightM?: number | null;
  notes?: string | null;
  tag?: string | null;
  groupKey?: string | null;
  groupTimeSec?: number | null;
  groupRounds?: number | null;
};

function fmtTotal(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Row({ it, n }: { it: ExerciseItem; n: number }) {
  const chips = itemChips(it as never);
  const tag = tagMeta(it.tag);
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-px shrink-0 w-5 h-5 rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500 flex items-center justify-center tabular-nums">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium leading-tight">{itemTitle(it as never)}</span>
          {tag && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tag.badge}`}>{tag.label}</span>}
        </div>
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {chips.map((c, j) => (
              <span
                key={j}
                className="inline-flex items-center rounded-md bg-white border border-border px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 tabular-nums"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {it.notes && <div className="mt-1.5 text-[11px] text-muted leading-snug">{it.notes}</div>}
      </div>
    </li>
  );
}

/**
 * A self-contained "workout block": a titled section that lists every exercise
 * as its own numbered row, with each target (distance, load, reps, pace, time)
 * shown as a separate pill. Grouped exercises render inside a nested card
 * with a "Group total: mm:ss" header. Display-only — renders on the server,
 * no JS.
 */
export default function ExerciseList({ items }: { items: ExerciseItem[] }) {
  if (!items?.length) return null;
  const rows = groupItems(items);
  const numberedRows = rows.map((row, i) => ({
    row,
    n: rows.slice(0, i + 1).filter((r) => r.kind === "solo").length,
  }));
  return (
    <div className="mt-3 rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-foreground/[0.02]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Workout</span>
        <span className="text-[10px] text-muted tabular-nums">
          {items.length} {items.length === 1 ? "exercise" : "exercises"}
        </span>
      </div>
      <ol className="divide-y divide-border">
        {numberedRows.map(({ row, n }, i) => {
          if (row.kind === "solo") {
            return <Row key={row.item.id ?? `s-${i}`} it={row.item} n={n} />;
          }
          // Group row — render the members as a nested numbered list with a
          // shared total-time header.
          return (
            <li key={row.key} className="px-3 py-2.5">
              <div className="rounded-lg border border-orange-300 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border-b border-border">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-orange-100 text-orange-700 px-2 py-0.5">
                    <Link size={10} /> Group
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    Group total: {fmtTotal(row.totalSec)}
                    {row.rounds && row.rounds > 1 && <span className="text-orange-700 ml-1">× {row.rounds}</span>}
                  </span>
                  <span className="text-[11px] text-muted ml-auto">{row.items.length} exercises</span>
                </div>
                <ol className="divide-y divide-border">
                  {row.items.map((it, j) => <Row key={it.id ?? `g-${i}-${j}`} it={it} n={j + 1} />)}
                </ol>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
