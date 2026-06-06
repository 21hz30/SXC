import { itemTitle, itemChips, tagMeta } from "@/domain/exercises";

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
};

/**
 * A self-contained "workout block": a titled section that lists every exercise
 * as its own numbered row, with each target (distance, load, reps, pace, time)
 * shown as a separate pill. Display-only — renders on the server, no JS.
 */
export default function ExerciseList({ items }: { items: ExerciseItem[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-foreground/[0.02]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Workout</span>
        <span className="text-[10px] text-muted tabular-nums">
          {items.length} {items.length === 1 ? "exercise" : "exercises"}
        </span>
      </div>
      <ol className="divide-y divide-border">
        {items.map((it, i) => {
          const chips = itemChips(it as never);
          const tag = tagMeta(it.tag);
          return (
            <li key={it.id ?? i} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-px shrink-0 w-5 h-5 rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500 flex items-center justify-center tabular-nums">
                {i + 1}
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
        })}
      </ol>
    </div>
  );
}
