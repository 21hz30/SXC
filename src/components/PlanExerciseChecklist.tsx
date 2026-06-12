"use client";

import { useState, useEffect } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { itemTitle, itemChips, tagMeta, groupItems } from "@/domain/exercises";
import type { ExerciseItem } from "./ExerciseList";

function fmtTotal(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The training-plan workout block, but with a tick-off checkbox per exercise
 * when there's more than one — so an athlete can check them off as they go.
 * Checked state persists in localStorage (keyed by the assignment), so it
 * survives a refresh without any backend. Single-exercise workouts show a plain
 * numbered row (no checkbox). Group items are rendered inside a brace card
 * with a "Group total" header; each sub-exercise still gets its own tick.
 */
export default function PlanExerciseChecklist({ items, storageKey }: { items: ExerciseItem[]; storageKey: string }) {
  const checkable = (items?.length ?? 0) > 1;
  const key = `sxc:plan-check:${storageKey}`;
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!checkable) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setChecked(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, [key, checkable]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  if (!items?.length) return null;
  const doneCount = items.filter((it) => it.id && checked.has(it.id)).length;
  const rows = groupItems(items);

  // Render one numbered or tick-able row (used inside both solo and group contexts).
  const Row = ({ it, n }: { it: ExerciseItem; n: number }) => {
    const chips = itemChips(it as never);
    const tag = tagMeta(it.tag);
    const isChecked = !!(it.id && checked.has(it.id));
    return (
      <li className="flex items-start gap-3 px-3 py-2.5">
        {checkable ? (
          <button
            type="button"
            onClick={() => it.id && toggle(it.id)}
            aria-pressed={isChecked}
            aria-label={isChecked ? "Mark exercise not done" : "Mark exercise done"}
            className={`mt-px shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition ${isChecked ? "bg-emerald-500 border-emerald-500 text-white" : "border-border bg-white text-transparent hover:border-emerald-400"}`}
          >
            <Check size={13} />
          </button>
        ) : (
          <span className="mt-px shrink-0 w-5 h-5 rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500 flex items-center justify-center tabular-nums">{n}</span>
        )}
        <div className={`min-w-0 flex-1 ${isChecked ? "opacity-50" : ""}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium leading-tight ${isChecked ? "line-through" : ""}`}>{itemTitle(it as never)}</span>
            {tag && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tag.badge}`}>{tag.label}</span>}
          </div>
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips.map((c, j) => (
                <span key={j} className="inline-flex items-center rounded-md bg-white border border-border px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 tabular-nums">{c}</span>
              ))}
            </div>
          )}
          {it.notes && <div className="mt-1.5 text-[11px] text-muted leading-snug">{it.notes}</div>}
        </div>
      </li>
    );
  };

  let n = 0;
  return (
    <div className="mt-3 rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-foreground/[0.02]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Workout</span>
        <span className="text-[10px] text-muted tabular-nums">
          {checkable ? `${doneCount}/${items.length} done` : `${items.length} ${items.length === 1 ? "exercise" : "exercises"}`}
        </span>
      </div>
      <ol className="divide-y divide-border">
        {rows.map((row, i) => {
          if (row.kind === "solo") {
            n += 1;
            return <Row key={row.item.id ?? `s-${i}`} it={row.item} n={n} />;
          }
          // Group row — nested card with brace header + "Group total: mm:ss".
          return (
            <li key={row.key} className="px-3 py-2.5">
              <div className="rounded-lg border border-accent/30 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/5 border-b border-border">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-accent/10 text-accent px-2 py-0.5">
                    <LinkIcon size={10} /> Group
                  </span>
                  <span className="text-xs font-semibold tabular-nums">Group total: {fmtTotal(row.totalSec)}</span>
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
