"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Trash2, Check, GripVertical } from "lucide-react";
import { toast } from "@/components/Toaster";
import { CATEGORIES, FIELD_META, EXERCISE_TAGS, formatItem, type Category, type FieldKey } from "@/domain/exercises";
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
};

let tmpCounter = 0;
const tmpId = () => `tmp_${Date.now()}_${tmpCounter++}`;

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
  const [showAdd, setShowAdd] = useState(items.length === 0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function markDirty() { setDirty(true); setSavedAt(null); }

  function addItemLocal(input: Omit<Item, "id">) {
    setItems((cur) => [...cur, { ...input, id: tmpId() }]);
    setShowAdd(false);
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
  function reorder(from: number, to: number) {
    if (from === to) return;
    setItems((cur) => {
      const copy = cur.slice();
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Exercises ({items.length})</h2>
          <button onClick={() => setShowAdd((s) => !s)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium flex items-center gap-1.5 hover:bg-card">
            {showAdd ? <X size={14} /> : <Plus size={14} />} {showAdd ? "Cancel" : "Add exercise"}
          </button>
        </div>

        {showAdd && <ItemForm onSubmit={(input) => addItemLocal(input)} onCancel={() => setShowAdd(false)} />}

        <ul className="space-y-2 mt-3">
          {items.map((it, idx) => {
            if (editingId === it.id) {
              return (
                <li key={it.id}>
                  <ItemForm initial={it} onSubmit={(input) => updateItemLocal(it.id, input)} onCancel={() => setEditingId(null)} />
                </li>
              );
            }
            const { title, details } = formatItem(it);
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
            return (
              <li
                key={it.id}
                draggable
                onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverIdx(idx); }}
                onDragLeave={() => setOverIdx((o) => (o === idx ? null : o))}
                onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) reorder(dragIdx, idx); setDragIdx(null); setOverIdx(null); }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                className={`group bg-card border rounded-xl px-3 py-3 flex items-center gap-2 transition ${
                  isDragging ? "opacity-40" : ""
                } ${isOver ? "border-accent border-2" : "border-border"}`}
              >
                <div className="cursor-grab active:cursor-grabbing text-muted hover:text-foreground shrink-0" title="Drag to reorder">
                  <GripVertical size={16} />
                </div>
                <div className="text-xs text-muted font-mono w-5 text-right shrink-0">{idx + 1}.</div>
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
          })}
          {items.length === 0 && !showAdd && (
            <li className="text-center text-sm text-muted py-6 bg-card border border-border border-dashed rounded-xl">No exercises yet — tap &quot;Add exercise&quot;.</li>
          )}
        </ul>
        {items.length > 1 && <div className="text-[11px] text-muted mt-2">Drag the ⠿ handle to reorder. Remember to Save.</div>}
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
