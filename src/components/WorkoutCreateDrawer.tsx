"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { ItemForm, type Item } from "./WorkoutEditor";
import { formatItem } from "@/domain/exercises";
import { toast } from "@/components/Toaster";

let tmpCounter = 0;
const tmpId = () => `wd_${Date.now()}_${tmpCounter++}`;

/**
 * Right-side slide-over for building a NEW workout on the class page: add the
 * name + its exercises first, then save once. Posts to
 * POST /api/class/[id]/workouts which creates the (shared library) workout with
 * its items and links it to the class.
 */
export default function WorkoutCreateDrawer({ classId }: { classId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [showAdd, setShowAdd] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(""); setDescription(""); setItems([]); setShowAdd(true); setEditingId(null); setTags("");
  }
  function close() { setOpen(false); }

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/class/${classId}/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          tags: tags.trim() || null,
          items: items.map(({ id: _id, ...rest }) => rest),
        }),
      });
      if (!res.ok) throw new Error("failed");
      toast(`"${name.trim()}" created & added`);
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      toast("Could not create the workout — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-foreground text-white px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 hover:opacity-90"
      >
        <Plus size={14} /> New workout
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={close} />
          <aside className="fixed inset-y-0 right-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col shadow-xl">
            <header className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="text-base font-semibold">New workout</h2>
              <button onClick={close} className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-background"><X size={18} /></button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pro Team Strength" autoFocus className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Description (optional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Tags (optional)</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma-separated, e.g. pro, strength" className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent" />
                <div className="text-[11px] text-muted mt-1">Tags help you quickly find this workout later (not tied to a camp).</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wide">Exercises ({items.length})</h3>
                  {!showAdd && !editingId && (
                    <button onClick={() => setShowAdd(true)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-background">
                      <Plus size={12} /> Add exercise
                    </button>
                  )}
                </div>

                <ul className="space-y-2 mb-2">
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
                    return (
                      <li key={it.id} className="group bg-background border border-border rounded-lg px-2.5 py-2 flex items-center gap-2">
                        <span className="text-xs text-muted font-mono w-5 text-right shrink-0">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{title}</div>
                          {details && <div className="text-xs text-muted">{details}</div>}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-50 group-hover:opacity-100">
                          <button onClick={() => { setEditingId(it.id); setShowAdd(false); }} className="p-1.5 text-muted hover:text-foreground" title="Edit"><Pencil size={12} /></button>
                          <button onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} className="p-1.5 text-muted hover:text-red-600" title="Delete"><Trash2 size={12} /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {showAdd && (
                  <ItemForm
                    onSubmit={(input) => { setItems((cur) => [...cur, { ...input, id: tmpId() }]); setShowAdd(false); }}
                    onCancel={() => setShowAdd(false)}
                  />
                )}
                {items.length === 0 && !showAdd && (
                  <div className="text-xs text-muted text-center py-3 border border-dashed border-border rounded-lg">No exercises yet — add one above.</div>
                )}
              </div>
            </div>

            <footer className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border shrink-0">
              <span className="text-xs text-muted">Saved to your workout library & added to this class.</span>
              <button
                onClick={create}
                disabled={saving || !name.trim()}
                className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium disabled:opacity-40 hover:opacity-90"
              >
                {saving ? "Creating…" : "Create & add"}
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
