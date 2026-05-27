"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Pencil, Trash2, Check, GripVertical } from "lucide-react";
import { formatItem } from "@/domain/exercises";
import { ItemForm, type Item } from "./WorkoutEditor";

let tmpCounter = 0;
const tmpId = () => `ctmp_${Date.now()}_${tmpCounter++}`;

/**
 * Inline editor for a single workout *within a class*. Read-only by default;
 * "Adjust" reveals the editable station list. Saving posts to the class
 * endpoint, which copies-on-write so other classes keep the original.
 */
export default function ClassWorkoutEditor({
  classId,
  workoutId,
  workoutName,
  description,
  initialItems,
}: {
  classId: string;
  workoutId: string;
  workoutName: string;
  description: string | null;
  initialItems: Item[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function startEditing() {
    setItems(initialItems);
    setEditing(true);
  }
  function cancel() {
    setItems(initialItems);
    setEditing(false);
    setEditingId(null);
    setShowAdd(false);
  }
  function reorder(from: number, to: number) {
    if (from === to) return;
    setItems((cur) => {
      const copy = cur.slice();
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/class/${classId}/workouts/${workoutId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map(({ id: _id, ...rest }) => rest) }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      alert("Save failed.");
    }
  }

  if (!editing) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <Link href={`/workouts/${workoutId}`} className="text-base font-semibold hover:text-accent">{workoutName}</Link>
            {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
          </div>
          <button onClick={startEditing} className="text-xs text-accent hover:underline flex items-center gap-1 shrink-0">
            <Pencil size={11} /> Adjust
          </button>
        </div>
        <ul className="divide-y divide-border -mx-2">
          {initialItems.map((it, idx) => {
            const { title, details } = formatItem(it);
            return (
              <li key={it.id} className="px-2 py-2 flex items-start gap-3">
                <span className="text-xs text-muted font-mono w-5 text-right shrink-0 pt-0.5">{idx + 1}.</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{title}</div>
                  {details && <div className="text-xs text-muted">{details}</div>}
                </div>
              </li>
            );
          })}
          {initialItems.length === 0 && <li className="px-2 py-3 text-xs text-muted">No exercises — click Adjust to add some.</li>}
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-card border-2 border-accent/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-base font-semibold">{workoutName}</div>
        <div className="flex items-center gap-2">
          <button onClick={cancel} className="text-xs text-muted hover:text-foreground px-2 py-1">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-foreground text-white px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40">
            <Check size={13} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="text-[11px] text-muted mb-3">Changes apply to this class only — other classes keep the original.</div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted uppercase tracking-wide">Exercises ({items.length})</h3>
        <button onClick={() => setShowAdd((s) => !s)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-background">
          {showAdd ? <X size={12} /> : <Plus size={12} />} {showAdd ? "Cancel" : "Add exercise"}
        </button>
      </div>

      {showAdd && (
        <ItemForm
          onSubmit={(input) => { setItems((cur) => [...cur, { ...input, id: tmpId() }]); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <ul className="space-y-2 mt-2">
        {items.map((it, idx) => {
          if (editingId === it.id) {
            return (
              <li key={it.id}>
                <ItemForm
                  initial={it}
                  onSubmit={(input) => { setItems((cur) => cur.map((x) => (x.id === it.id ? { ...input, id: it.id } : x))); setEditingId(null); }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            );
          }
          const { title, details } = formatItem(it);
          const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
          return (
            <li
              key={it.id}
              draggable
              onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDragLeave={() => setOverIdx((o) => (o === idx ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) reorder(dragIdx, idx); setDragIdx(null); setOverIdx(null); }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              className={`group bg-background border rounded-lg px-2.5 py-2 flex items-center gap-2 ${isOver ? "border-accent border-2" : "border-border"}`}
            >
              <span className="cursor-grab active:cursor-grabbing text-muted shrink-0"><GripVertical size={14} /></span>
              <span className="text-xs text-muted font-mono w-5 text-right shrink-0">{idx + 1}.</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{title}</div>
                {details && <div className="text-xs text-muted">{details}</div>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0 opacity-50 group-hover:opacity-100">
                <button onClick={() => setEditingId(it.id)} className="p-1.5 text-muted hover:text-foreground" title="Edit"><Pencil size={12} /></button>
                <button onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} className="p-1.5 text-muted hover:text-red-600" title="Delete"><Trash2 size={12} /></button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
