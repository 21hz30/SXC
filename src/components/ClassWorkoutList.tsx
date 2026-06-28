"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Minus, Plus, Copy } from "lucide-react";
import { toast } from "@/components/Toaster";

type Item = { workoutId: string; rounds: number; card: React.ReactNode };

/**
 * Wraps a class's workout cards with a drag handle (reorder) and a rounds
 * stepper per workout. Persists to the class workout APIs; the heavy editor /
 * feedback cards are passed in as `card` so only the handle starts a drag.
 */
export default function ClassWorkoutList({ classId, items }: { classId: string; items: Item[] }) {
  const router = useRouter();
  // Re-sync when the server set changes (a workout was added/removed).
  const key = items.map((i) => i.workoutId).join(",");
  const [itemsKey, setItemsKey] = useState(key);
  const [order, setOrder] = useState<Item[]>(items);
  const [rounds, setRounds] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.workoutId, i.rounds])));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  if (key !== itemsKey) {
    setItemsKey(key);
    setOrder(items);
    setRounds(Object.fromEntries(items.map((i) => [i.workoutId, i.rounds])));
  }

  async function persistOrder(next: Item[]) {
    try {
      const res = await fetch(`/api/class/${classId}/workouts/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next.map((i) => i.workoutId) }),
      });
      if (!res.ok) throw new Error("failed");
      toast("Order updated");
    } catch {
      toast("Could not save the new order.");
    } finally {
      router.refresh();
    }
  }

  function drop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const next = order.slice();
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    setOrder(next);
    setDragIdx(null);
    setOverIdx(null);
    persistOrder(next);
  }

  async function duplicate(workoutId: string) {
    try {
      const res = await fetch(`/api/class/${classId}/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateOf: workoutId }),
      });
      if (!res.ok) throw new Error("failed");
      toast("Workout duplicated — tweak the copy below");
    } catch {
      toast("Could not duplicate the workout.");
    } finally {
      router.refresh();
    }
  }

  async function setRoundsFor(workoutId: string, value: number) {
    const v = Math.max(1, Math.min(50, value));
    setRounds((r) => ({ ...r, [workoutId]: v }));
    try {
      await fetch(`/api/class/${classId}/workouts/${workoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds: v }),
      });
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {order.map((it, idx) => {
        const r = rounds[it.workoutId] ?? 1;
        const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
        return (
          <div
            key={it.workoutId}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
            onDrop={(e) => { e.preventDefault(); drop(idx); }}
            className={`rounded-xl ${isOver ? "ring-2 ring-accent" : ""}`}
          >
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                className="inline-flex items-center gap-1 text-xs text-muted cursor-grab active:cursor-grabbing select-none"
                title="Drag to reorder"
              >
                <GripVertical size={14} /> Drag to reorder
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => duplicate(it.workoutId)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-accent hover:border-accent" title="Duplicate this workout (creates an editable copy on the class)">
                  <Copy size={12} /> Duplicate
                </button>
                <span className="ml-1 text-xs text-muted">Rounds</span>
                <button type="button" onClick={() => setRoundsFor(it.workoutId, r - 1)} disabled={r <= 1} className="w-6 h-6 rounded-md border border-border text-muted hover:bg-background flex items-center justify-center disabled:opacity-40"><Minus size={12} /></button>
                <span className="w-6 text-center text-sm font-medium tabular-nums">{r}</span>
                <button type="button" onClick={() => setRoundsFor(it.workoutId, r + 1)} className="w-6 h-6 rounded-md border border-border text-muted hover:bg-background flex items-center justify-center"><Plus size={12} /></button>
              </div>
            </div>
            {it.card}
          </div>
        );
      })}
    </div>
  );
}
