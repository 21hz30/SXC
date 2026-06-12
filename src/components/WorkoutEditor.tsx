"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Trash2, Check, GripVertical, Link as LinkIcon } from "lucide-react";
import { toast } from "@/components/Toaster";
import { CATEGORIES, FIELD_META, EXERCISE_TAGS, formatItem, groupItems, type Category, type FieldKey } from "@/domain/exercises";
import { WORKOUT_TYPES } from "@/lib/workoutTypes";
import TagCombobox from "@/components/TagCombobox";

export type Item = {
  id: string; // local id (may be temp for new items)
  category: Category;
  label: string | null;
  distanceM: number | null;
  timeSec: number | null;
  weightKg: number | null;
  reps: number | null;
  sets: number | null;
  paceSecPerKm: number | null;
  heightM: number | null;
  notes: string | null;
  tag: string | null;
  groupKey: string | null;
  groupTimeSec: number | null;
};

let tmpCounter = 0;
const tmpId = () => `tmp_${Date.now()}_${tmpCounter++}`;
const newGroupKey = () => `g_${Date.now()}_${tmpCounter++}`;

function fmtTotal(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WorkoutEditor({
  workoutId,
  initialName,
  initialDescription,
  initialType,
  initialTags,
  initialItems,
  allTags,
}: {
  workoutId: string;
  initialName: string;
  initialDescription: string | null;
  initialType: string | null;
  initialTags: string | null;
  initialItems: Item[];
  allTags: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [type, setType] = useState<string>(initialType ?? "");
  const [tags, setTags] = useState<string[]>(
    (initialTags ?? "").split(",").map((t) => t.trim()).filter(Boolean)
  );
  const [items, setItems] = useState<Item[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"none" | "exercise" | "group">(items.length === 0 ? "exercise" : "none");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function markDirty() { setDirty(true); setSavedAt(null); }

  function addItemLocal(input: Omit<Item, "id">) {
    setItems((cur) => [...cur, { ...input, id: tmpId() }]);
    setAddMode("none");
    markDirty();
  }
  function updateItemLocal(id: string, input: Omit<Item, "id">) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...input, id } : i)));
    setEditingId(null);
    markDirty();
  }
  function removeItemLocal(id: string) {
    setItems((cur) => cur.filter((i) => i.id !== id));
    markDirty();
  }

  function addGroupLocal(members: Omit<Item, "id" | "groupKey" | "groupTimeSec">[], totalSec: number | null) {
    const key = newGroupKey();
    const stamped: Item[] = members.map((m, i) => ({
      ...m,
      id: tmpId(),
      groupKey: key,
      groupTimeSec: i === 0 ? totalSec : null,
      // Individual timeSec doesn't apply inside a group — total time is shared.
      timeSec: null,
    }));
    setItems((cur) => [...cur, ...stamped]);
    setAddMode("none");
    markDirty();
  }
  function updateGroupLocal(key: string, members: Omit<Item, "id" | "groupKey" | "groupTimeSec">[], totalSec: number | null) {
    setItems((cur) => {
      const idx = cur.findIndex((i) => i.groupKey === key);
      if (idx < 0) return cur;
      // Splice out the old group members and insert the new ones in the same slot.
      const before = cur.slice(0, idx);
      const after = cur.slice(idx).filter((i) => i.groupKey !== key);
      const stamped: Item[] = members.map((m, i) => ({
        ...m,
        id: tmpId(),
        groupKey: key,
        groupTimeSec: i === 0 ? totalSec : null,
        timeSec: null,
      }));
      return [...before, ...stamped, ...after];
    });
    setEditingGroupKey(null);
    markDirty();
  }
  function removeGroupLocal(key: string) {
    setItems((cur) => cur.filter((i) => i.groupKey !== key));
    markDirty();
  }

  // Reorder by ROWS (solo items + groups), keeping each group's members together.
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
    markDirty();
  }

  async function save() {
    setSaving(true);
    const payload = {
      name,
      description: description || null,
      type: type || null,
      tags: tags.join(",") || null,
      items: items.map(({ id: _id, ...rest }) => rest),
    };
    const res = await fetch(`/api/workouts/${workoutId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setSavedAt(Date.now());
      toast("Workout saved");
      router.refresh();
    } else {
      alert("Save failed.");
    }
  }

  async function deleteWorkout() {
    if (!confirm(`Delete workout "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/workouts/${workoutId}`, { method: "DELETE" });
    toast("Workout deleted");
    router.push("/workouts");
  }

  const rows = groupItems(items);

  return (
    <div className="space-y-6">
      {/* Sticky save bar */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/80 backdrop-blur flex items-center justify-between">
        <div className="text-xs text-muted">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? "All changes saved" : "No changes"}
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-foreground text-white px-5 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-40 hover:opacity-90"
        >
          <Check size={15} /> Save
        </button>
      </div>

      {/* Meta */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Name</label>
          <input value={name} onChange={(e) => { setName(e.target.value); markDirty(); }} className="w-full rounded-lg border border-border px-3 py-2 text-base font-semibold outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Description</label>
          <textarea value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }} rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); markDirty(); }} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="">Uncategorized</option>
            {WORKOUT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Tags</label>
          <TagCombobox value={tags} onChange={(t) => { setTags(t); markDirty(); }} suggestions={allTags} placeholder="Choose an existing tag or create one…" />
          <div className="text-[11px] text-muted mt-1">Pick from existing tags, or type a new one — it&apos;s reusable next time.</div>
        </div>
      </section>

      {/* Items */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Exercises ({items.length})</h2>
          <div className="flex items-center gap-1.5">
            {addMode === "none" ? (
              <>
                <button onClick={() => setAddMode("exercise")} className="rounded-lg border border-border px-3 py-2 text-sm font-medium flex items-center gap-1.5 hover:bg-card">
                  <Plus size={14} /> Add exercise
                </button>
                <button onClick={() => setAddMode("group")} className="rounded-lg border border-border px-3 py-2 text-sm font-medium flex items-center gap-1.5 hover:bg-card" title="2+ exercises that share one total time">
                  <LinkIcon size={14} /> Add group
                </button>
              </>
            ) : (
              <button onClick={() => setAddMode("none")} className="rounded-lg border border-border px-3 py-2 text-sm font-medium flex items-center gap-1.5 hover:bg-card">
                <X size={14} /> Cancel
              </button>
            )}
          </div>
        </div>

        {addMode === "exercise" && <ItemForm onSubmit={(input) => addItemLocal(input)} onCancel={() => setAddMode("none")} />}
        {addMode === "group" && <GroupForm onSubmit={addGroupLocal} onCancel={() => setAddMode("none")} />}

        <ul className="space-y-2 mt-3">
          {rows.map((row, rowIdx) => {
            const isDragging = dragIdx === rowIdx;
            const isOver = overIdx === rowIdx && dragIdx !== null && dragIdx !== rowIdx;
            const dragProps = {
              draggable: true,
              onDragStart: (e: React.DragEvent) => { setDragIdx(rowIdx); e.dataTransfer.effectAllowed = "move"; },
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverIdx(rowIdx); },
              onDragLeave: () => setOverIdx((o) => (o === rowIdx ? null : o)),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragIdx !== null) reorderRows(dragIdx, rowIdx); setDragIdx(null); setOverIdx(null); },
              onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
            };

            if (row.kind === "solo") {
              const it = row.item;
              if (editingId === it.id) {
                return (
                  <li key={it.id}>
                    <ItemForm initial={it} onSubmit={(input) => updateItemLocal(it.id, input)} onCancel={() => setEditingId(null)} />
                  </li>
                );
              }
              const { title, details } = formatItem(it);
              return (
                <li
                  key={it.id}
                  {...dragProps}
                  className={`group bg-card border rounded-xl px-3 py-3 flex items-center gap-2 transition ${
                    isDragging ? "opacity-40" : ""
                  } ${isOver ? "border-accent border-2" : "border-border"}`}
                >
                  <div className="cursor-grab active:cursor-grabbing text-muted hover:text-foreground shrink-0" title="Drag to reorder">
                    <GripVertical size={16} />
                  </div>
                  <div className="text-xs text-muted font-mono w-5 text-right shrink-0">{rowIdx + 1}.</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{title}</div>
                    {details && <div className="text-xs text-muted mt-0.5">{details}</div>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-50 group-hover:opacity-100 transition">
                    <button onClick={() => setEditingId(it.id)} className="p-1.5 text-muted hover:text-foreground" title="Edit"><Pencil size={13} /></button>
                    <button onClick={() => removeItemLocal(it.id)} className="p-1.5 text-muted hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
                  </div>
                </li>
              );
            }

            // Group row
            if (editingGroupKey === row.key) {
              const initial = {
                members: row.items.map(({ id: _id, groupKey: _g, groupTimeSec: _t, ...rest }) => rest),
                totalSec: row.totalSec,
              };
              return (
                <li key={row.key}>
                  <GroupForm initial={initial} onSubmit={(members, totalSec) => updateGroupLocal(row.key, members, totalSec)} onCancel={() => setEditingGroupKey(null)} />
                </li>
              );
            }
            return (
              <li
                key={row.key}
                {...dragProps}
                className={`bg-card border rounded-xl transition ${
                  isDragging ? "opacity-40" : ""
                } ${isOver ? "border-accent border-2" : "border-accent/40"}`}
              >
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-accent/5">
                  <div className="cursor-grab active:cursor-grabbing text-muted hover:text-foreground shrink-0" title="Drag to reorder">
                    <GripVertical size={16} />
                  </div>
                  <div className="text-xs text-muted font-mono w-5 text-right shrink-0">{rowIdx + 1}.</div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-accent/10 text-accent px-2 py-0.5">
                    <LinkIcon size={10} /> Group
                  </span>
                  <span className="text-sm font-semibold tabular-nums ml-1">
                    Group total: {fmtTotal(row.totalSec)}
                  </span>
                  <span className="text-xs text-muted ml-auto">{row.items.length} exercises</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => setEditingGroupKey(row.key)} className="p-1.5 text-muted hover:text-foreground" title="Edit group"><Pencil size={13} /></button>
                    <button onClick={() => removeGroupLocal(row.key)} className="p-1.5 text-muted hover:text-red-600" title="Delete group"><Trash2 size={13} /></button>
                  </div>
                </div>
                <ol className="divide-y divide-border">
                  {row.items.map((it, j) => {
                    const { title, details } = formatItem(it);
                    return (
                      <li key={it.id} className="flex items-start gap-2 px-3 py-2">
                        <span className="mt-px shrink-0 w-5 h-5 rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500 flex items-center justify-center tabular-nums">
                          {j + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-tight">{title}</div>
                          {details && <div className="text-xs text-muted mt-0.5">{details}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
          {items.length === 0 && addMode === "none" && (
            <li className="text-center text-sm text-muted py-6 bg-card border border-border border-dashed rounded-xl">No exercises yet — tap &quot;Add exercise&quot; or &quot;Add group&quot;.</li>
          )}
        </ul>
        {rows.length > 1 && <div className="text-[11px] text-muted mt-2">Drag the ⠿ handle to reorder. Remember to Save.</div>}
      </section>

      <div className="pt-2">
        <button onClick={deleteWorkout} className="text-xs text-muted hover:text-red-600">Delete this workout</button>
      </div>
    </div>
  );
}

export function ItemForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Item;
  onSubmit: (input: Omit<Item, "id">) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<Category>(initial?.category ?? "ski");
  const [tag, setTag] = useState<string>(initial?.tag ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => ({
    label: initial?.label ?? "",
    distanceM: initial?.distanceM?.toString() ?? "",
    weightKg: initial?.weightKg?.toString() ?? "",
    reps: initial?.reps?.toString() ?? "",
    sets: initial?.sets?.toString() ?? "",
    paceSecPerKm: initial?.paceSecPerKm?.toString() ?? "",
    heightM: initial?.heightM?.toString() ?? "",
    notes: initial?.notes ?? "",
  }));
  // Duration is entered as minutes + seconds and stored as total seconds.
  const [timeMin, setTimeMin] = useState(initial?.timeSec != null ? String(Math.floor(initial.timeSec / 60)) : "");
  const [timeSecPart, setTimeSecPart] = useState(initial?.timeSec != null ? String(initial.timeSec % 60) : "");
  const fields = CATEGORIES[category].fields;
  const setField = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
  const labelCls = "block text-xs font-medium text-muted uppercase tracking-wide mb-1.5";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = (k: string) => (values[k] && values[k].length > 0 ? Number(values[k]) : null);
    const timeSec = timeMin === "" && timeSecPart === "" ? null : Number(timeMin || 0) * 60 + Number(timeSecPart || 0);
    onSubmit({
      category,
      label: values.label?.trim() || null,
      distanceM: num("distanceM"),
      timeSec,
      weightKg: num("weightKg"),
      reps: num("reps"),
      sets: num("sets"),
      paceSecPerKm: num("paceSecPerKm"),
      heightM: num("heightM"),
      notes: values.notes?.trim() || null,
      tag: tag || null,
      groupKey: initial?.groupKey ?? null,
      groupTimeSec: initial?.groupTimeSec ?? null,
    });
  }

  return (
    <form onSubmit={submit} className="bg-background border border-accent/40 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Exercise</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputCls}>
            {(Object.keys(CATEGORIES) as Category[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{category === "other" ? "Exercise name" : "Label (optional)"}</label>
          <input value={values.label ?? ""} onChange={(e) => setField("label", e.target.value)} placeholder={category === "other" ? "Type a custom exercise, e.g. Box jumps" : "e.g. Round 1"} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Tag (optional)</label>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={inputCls}>
            <option value="">No tag</option>
            {EXERCISE_TAGS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(fields as FieldKey[]).filter((f) => f !== "notes").map((f) =>
          f === "timeSec" ? (
            <div key={f}>
              <label className={labelCls}>Duration (min : sec)</label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} step={1} value={timeMin} onChange={(e) => setTimeMin(e.target.value)} placeholder="min" className="w-full min-w-0 rounded-lg border border-border bg-white px-2 py-2 text-sm" />
                <span className="text-muted shrink-0">:</span>
                <input type="number" min={0} max={59} step={1} value={timeSecPart} onChange={(e) => setTimeSecPart(e.target.value)} placeholder="sec" className="w-full min-w-0 rounded-lg border border-border bg-white px-2 py-2 text-sm" />
              </div>
            </div>
          ) : (
            <div key={f}>
              <label className={labelCls}>
                {FIELD_META[f].label}{FIELD_META[f].suffix ? ` (${FIELD_META[f].suffix})` : ""}
              </label>
              <input type="number" step={f === "heightM" || f === "weightKg" ? "0.1" : "1"} value={values[f] ?? ""} onChange={(e) => setField(f, e.target.value)} className={inputCls} />
            </div>
          )
        )}
      </div>
      {fields.includes("notes") && (
        <div>
          <label className={labelCls}>Notes</label>
          <input value={values.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} placeholder="e.g. @ goal pace + 10s" className={inputCls} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
        <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">{initial ? "Update" : "Add"}</button>
      </div>
    </form>
  );
}

// ─── Group form ──────────────────────────────────────────────────────────────
type GroupMember = Omit<Item, "id" | "groupKey" | "groupTimeSec">;

function emptyMember(): GroupMember {
  return {
    category: "other" as Category,
    label: null,
    distanceM: null,
    timeSec: null,
    weightKg: null,
    reps: null,
    sets: null,
    paceSecPerKm: null,
    heightM: null,
    notes: null,
    tag: null,
  };
}

/**
 * Form for a "group" — 2+ exercises that share one total time (e.g. burpees +
 * wall balls + row, timed as a single block). Each member is a compact row
 * (category + label + reps/sets/distance/weight/notes); the total time lives
 * once at the bottom, not per member.
 */
function GroupForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: { members: GroupMember[]; totalSec: number | null };
  onSubmit: (members: GroupMember[], totalSec: number | null) => void;
  onCancel: () => void;
}) {
  const [members, setMembers] = useState<GroupMember[]>(initial?.members?.length ? initial.members : [emptyMember(), emptyMember()]);
  const [totalMin, setTotalMin] = useState(initial?.totalSec != null ? String(Math.floor(initial.totalSec / 60)) : "");
  const [totalSecPart, setTotalSecPart] = useState(initial?.totalSec != null ? String(initial.totalSec % 60) : "");

  function updateMember(i: number, patch: Partial<GroupMember>) {
    setMembers((cur) => cur.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }
  function addMember() {
    setMembers((cur) => [...cur, emptyMember()]);
  }
  function removeMember(i: number) {
    setMembers((cur) => cur.filter((_, j) => j !== i));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const totalSec = totalMin === "" && totalSecPart === "" ? null : Number(totalMin || 0) * 60 + Number(totalSecPart || 0);
    // Filter out completely-empty member rows.
    const nonEmpty = members.filter((m) => m.label?.trim() || m.reps != null || m.sets != null || m.distanceM != null || m.weightKg != null || m.notes?.trim() || m.category !== "other");
    if (nonEmpty.length < 2) {
      alert("A group needs at least 2 exercises.");
      return;
    }
    onSubmit(nonEmpty, totalSec);
  }

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
  const labelCls = "block text-[10px] font-medium text-muted uppercase tracking-wide mb-1";

  return (
    <form onSubmit={submit} className="bg-background border border-accent/40 rounded-xl p-4 space-y-4">
      <div className="text-xs text-muted">
        Combine 2+ exercises with one shared <span className="font-semibold text-foreground">total time</span>. Use this for compromised sets (e.g. burpees + wall balls + row, timed as one block).
      </div>

      <ul className="space-y-3">
        {members.map((m, i) => (
          <li key={i} className="bg-card border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Exercise {i + 1}</div>
              {members.length > 2 && (
                <button type="button" onClick={() => removeMember(i)} className="p-1 text-muted hover:text-red-600" title="Remove this exercise"><X size={13} /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Exercise</label>
                <select
                  value={m.category}
                  onChange={(e) => updateMember(i, { category: e.target.value as Category })}
                  className={inputCls}
                >
                  {(Object.keys(CATEGORIES) as Category[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{m.category === "other" ? "Exercise name" : "Label (optional)"}</label>
                <input value={m.label ?? ""} onChange={(e) => updateMember(i, { label: e.target.value || null })} placeholder={m.category === "other" ? "e.g. Burpees" : "e.g. Round 1"} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className={labelCls}>Reps</label>
                <input type="number" min={0} value={m.reps ?? ""} onChange={(e) => updateMember(i, { reps: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Sets</label>
                <input type="number" min={0} value={m.sets ?? ""} onChange={(e) => updateMember(i, { sets: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Distance (m)</label>
                <input type="number" min={0} value={m.distanceM ?? ""} onChange={(e) => updateMember(i, { distanceM: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Weight (kg)</label>
                <input type="number" min={0} step="0.1" value={m.weightKg ?? ""} onChange={(e) => updateMember(i, { weightKg: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <input value={m.notes ?? ""} onChange={(e) => updateMember(i, { notes: e.target.value || null })} className={inputCls} />
            </div>
          </li>
        ))}
      </ul>

      <button type="button" onClick={addMember} className="text-xs rounded-lg border border-dashed border-border px-3 py-1.5 hover:border-accent inline-flex items-center gap-1.5">
        <Plus size={12} /> Add another exercise
      </button>

      <div className="border-t border-border pt-3">
        <label className={`${labelCls} text-foreground/80`}>Group total time</label>
        <div className="flex items-center gap-1 max-w-[12rem]">
          <input type="number" min={0} step={1} value={totalMin} onChange={(e) => setTotalMin(e.target.value)} placeholder="min" className="w-full min-w-0 rounded-lg border border-border bg-white px-2 py-2 text-sm" />
          <span className="text-muted shrink-0">:</span>
          <input type="number" min={0} max={59} step={1} value={totalSecPart} onChange={(e) => setTotalSecPart(e.target.value)} placeholder="sec" className="w-full min-w-0 rounded-lg border border-border bg-white px-2 py-2 text-sm" />
        </div>
        <div className="text-[11px] text-muted mt-1">Shared by all exercises in this group.</div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
        <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">{initial ? "Update group" : "Add group"}</button>
      </div>
    </form>
  );
}
