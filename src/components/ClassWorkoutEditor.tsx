"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Pencil, Trash2, Check, GripVertical, Link as LinkIcon } from "lucide-react";
import { formatItem, groupItems } from "@/domain/exercises";
import { ItemForm, GroupForm, type Item, type GroupMember } from "./WorkoutEditor";
import { toast } from "@/components/Toaster";

let tmpCounter = 0;
const tmpId = () => `ctmp_${Date.now()}_${tmpCounter++}`;
const newGroupKey = () => `cg_${Date.now()}_${tmpCounter++}`;

function fmtTotal(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Inline editor for a single workout *within a class*. Read-only by default;
 * "Adjust" reveals the editable station list. Saving posts to the class
 * endpoint, which copies-on-write so other classes keep the original.
 *
 * Supports both individual exercises and exercise groups — 2+ exercises that
 * share one total time (e.g. burpees + wall balls + row).
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
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"none" | "exercise" | "group">("none");
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function startEditing() {
    setItems(initialItems);
    setEditing(true);
    setAddMode("none");
  }
  function cancel() {
    setItems(initialItems);
    setEditing(false);
    setEditingId(null);
    setEditingGroupKey(null);
    setAddMode("none");
  }

  function addGroupLocal(members: GroupMember[], totalSec: number | null, rounds: number | null) {
    const key = newGroupKey();
    const stamped: Item[] = members.map((m, i) => ({
      ...m,
      id: tmpId(),
      groupKey: key,
      groupTimeSec: i === 0 ? totalSec : null,
      groupRounds: i === 0 ? rounds : null,
    }));
    setItems((cur) => [...cur, ...stamped]);
    setAddMode("none");
  }
  function updateGroupLocal(key: string, members: GroupMember[], totalSec: number | null, rounds: number | null) {
    setItems((cur) => {
      const idx = cur.findIndex((i) => i.groupKey === key);
      if (idx < 0) return cur;
      const before = cur.slice(0, idx);
      const after = cur.slice(idx).filter((i) => i.groupKey !== key);
      const stamped: Item[] = members.map((m, i) => ({
        ...m,
        id: tmpId(),
        groupKey: key,
        groupTimeSec: i === 0 ? totalSec : null,
        groupRounds: i === 0 ? rounds : null,
      }));
      return [...before, ...stamped, ...after];
    });
    setEditingGroupKey(null);
  }
  function removeGroupLocal(key: string) {
    setItems((cur) => cur.filter((i) => i.groupKey !== key));
  }

  function reorderRows(from: number, to: number) {
    if (from === to) return;
    setItems((cur) => {
      const rows = groupItems(cur);
      const copy = rows.slice();
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      const out: Item[] = [];
      for (const r of copy) {
        if (r.kind === "solo") out.push(r.item);
        else out.push(...r.items);
      }
      return out;
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
      toast("Workout updated");
      router.refresh();
    } else {
      alert("Save failed.");
    }
  }

  if (!editing) {
    const rows = groupItems(initialItems);
    let n = 0;
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
          {rows.map((row, i) => {
            if (row.kind === "solo") {
              n += 1;
              const { title, details } = formatItem(row.item);
              return (
                <li key={row.item.id} className="px-2 py-2 flex items-start gap-3">
                  <span className="text-xs text-muted font-mono w-5 text-right shrink-0 pt-0.5">{n}.</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{title}</div>
                    {details && <div className="text-xs text-muted">{details}</div>}
                  </div>
                </li>
              );
            }
            return (
              <li key={row.key} className="px-2 py-2">
                <div className="rounded-lg border border-accent/30 bg-background overflow-hidden">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-accent/5 border-b border-border">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-accent/10 text-accent px-2 py-0.5">
                      <LinkIcon size={10} /> Group
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      Group total: {fmtTotal(row.totalSec)}
                      {row.rounds && row.rounds > 1 && <span className="text-accent ml-1">× {row.rounds}</span>}
                    </span>
                    <span className="text-[11px] text-muted ml-auto">{row.items.length} exercises</span>
                  </div>
                  <ol className="divide-y divide-border">
                    {row.items.map((it, j) => {
                      const { title, details } = formatItem(it);
                      return (
                        <li key={it.id} className="px-2 py-2 flex items-start gap-3">
                          <span className="text-xs text-muted font-mono w-5 text-right shrink-0 pt-0.5">{j + 1}.</span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{title}</div>
                            {details && <div className="text-xs text-muted">{details}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </li>
            );
          })}
          {initialItems.length === 0 && <li className="px-2 py-3 text-xs text-muted">No exercises — click Adjust to add some.</li>}
        </ul>
      </div>
    );
  }

  const rows = groupItems(items);

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

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-xs font-medium text-muted uppercase tracking-wide">Exercises ({items.length})</h3>
        <div className="flex items-center gap-1.5">
          {addMode === "none" ? (
            <>
              <button onClick={() => setAddMode("exercise")} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-background">
                <Plus size={12} /> Add exercise
              </button>
              <button onClick={() => setAddMode("group")} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-background" title="2+ exercises that share one total time">
                <LinkIcon size={12} /> Add group
              </button>
            </>
          ) : (
            <button onClick={() => setAddMode("none")} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-background">
              <X size={12} /> Cancel
            </button>
          )}
        </div>
      </div>

      {addMode === "exercise" && (
        <ItemForm
          onSubmit={(input) => { setItems((cur) => [...cur, { ...input, id: tmpId() }]); setAddMode("none"); }}
          onCancel={() => setAddMode("none")}
        />
      )}
      {addMode === "group" && (
        <GroupForm onSubmit={addGroupLocal} onCancel={() => setAddMode("none")} />
      )}

      <ul className="space-y-2 mt-2">
        {rows.map((row, rowIdx) => {
          const isOver = overIdx === rowIdx && dragIdx !== null && dragIdx !== rowIdx;
          const dragProps = {
            draggable: true,
            onDragStart: (e: React.DragEvent) => { setDragIdx(rowIdx); e.dataTransfer.effectAllowed = "move"; },
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOverIdx(rowIdx); },
            onDragLeave: () => setOverIdx((o) => (o === rowIdx ? null : o)),
            onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragIdx !== null) reorderRows(dragIdx, rowIdx); setDragIdx(null); setOverIdx(null); },
            onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
          };

          if (row.kind === "solo") {
            const it = row.item;
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
            return (
              <li
                key={it.id}
                {...dragProps}
                className={`group bg-background border rounded-lg px-2.5 py-2 flex items-center gap-2 ${isOver ? "border-accent border-2" : "border-border"}`}
              >
                <span className="cursor-grab active:cursor-grabbing text-muted shrink-0"><GripVertical size={14} /></span>
                <span className="text-xs text-muted font-mono w-5 text-right shrink-0">{rowIdx + 1}.</span>
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
          }

          // Group row
          if (editingGroupKey === row.key) {
            const initial = {
              members: row.items.map(({ id: _id, groupKey: _g, groupTimeSec: _t, groupRounds: _r, ...rest }) => rest),
              totalSec: row.totalSec,
              rounds: row.rounds,
            };
            return (
              <li key={row.key}>
                <GroupForm
                  initial={initial}
                  onSubmit={(members, totalSec, rounds) => updateGroupLocal(row.key, members, totalSec, rounds)}
                  onCancel={() => setEditingGroupKey(null)}
                />
              </li>
            );
          }
          return (
            <li
              key={row.key}
              {...dragProps}
              className={`bg-background border rounded-lg ${isOver ? "border-accent border-2" : "border-accent/40"}`}
            >
              <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border bg-accent/5">
                <span className="cursor-grab active:cursor-grabbing text-muted shrink-0"><GripVertical size={14} /></span>
                <span className="text-xs text-muted font-mono w-5 text-right shrink-0">{rowIdx + 1}.</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-accent/10 text-accent px-2 py-0.5">
                  <LinkIcon size={10} /> Group
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  Group total: {fmtTotal(row.totalSec)}
                  {row.rounds && row.rounds > 1 && <span className="text-accent ml-1">× {row.rounds}</span>}
                </span>
                <span className="text-[11px] text-muted ml-auto">{row.items.length} exercises</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => setEditingGroupKey(row.key)} className="p-1.5 text-muted hover:text-foreground" title="Edit group"><Pencil size={12} /></button>
                  <button onClick={() => removeGroupLocal(row.key)} className="p-1.5 text-muted hover:text-red-600" title="Delete group"><Trash2 size={12} /></button>
                </div>
              </div>
              <ol className="divide-y divide-border">
                {row.items.map((it, j) => {
                  const { title, details } = formatItem(it);
                  return (
                    <li key={it.id} className="flex items-start gap-2 px-2.5 py-2">
                      <span className="text-xs text-muted font-mono w-5 text-right shrink-0 pt-0.5">{j + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{title}</div>
                        {details && <div className="text-xs text-muted">{details}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
