"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Trash2, Link as LinkIcon } from "lucide-react";
import { ItemForm, GroupForm, type Item, type GroupMember } from "./WorkoutEditor";
import { formatItem, groupItems } from "@/domain/exercises";
import { toast } from "@/components/Toaster";

let tmpCounter = 0;
const tmpId = () => `wd_${Date.now()}_${tmpCounter++}`;
const newGroupKey = () => `wdg_${Date.now()}_${tmpCounter++}`;

function fmtTotal(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Right-side slide-over for building a NEW workout on the class page: add the
 * name + its exercises (and groups) first, then save once. Posts to
 * POST /api/class/[id]/workouts which creates the (shared library) workout with
 * its items and links it to the class.
 */
export default function WorkoutCreateDrawer({ classId }: { classId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [addMode, setAddMode] = useState<"none" | "exercise" | "group">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(""); setDescription(""); setItems([]); setTags("");
    setAddMode("none"); setEditingId(null); setEditingGroupKey(null);
  }
  function close() { setOpen(false); }

  function addGroupLocal(members: GroupMember[], totalSec: number | null) {
    const key = newGroupKey();
    const stamped: Item[] = members.map((m, i) => ({
      ...m,
      id: tmpId(),
      groupKey: key,
      groupTimeSec: i === 0 ? totalSec : null,
      timeSec: null,
    }));
    setItems((cur) => [...cur, ...stamped]);
    setAddMode("none");
  }
  function updateGroupLocal(key: string, members: GroupMember[], totalSec: number | null) {
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
        timeSec: null,
      }));
      return [...before, ...stamped, ...after];
    });
    setEditingGroupKey(null);
  }
  function removeGroupLocal(key: string) {
    setItems((cur) => cur.filter((i) => i.groupKey !== key));
  }

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

  const rows = groupItems(items);

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
                        <li key={it.id} className="group bg-background border border-border rounded-lg px-2.5 py-2 flex items-center gap-2">
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
                        members: row.items.map(({ id: _id, groupKey: _g, groupTimeSec: _t, ...rest }) => rest),
                        totalSec: row.totalSec,
                      };
                      return (
                        <li key={row.key}>
                          <GroupForm
                            initial={initial}
                            onSubmit={(members, totalSec) => updateGroupLocal(row.key, members, totalSec)}
                            onCancel={() => setEditingGroupKey(null)}
                          />
                        </li>
                      );
                    }
                    return (
                      <li key={row.key} className="bg-background border border-accent/40 rounded-lg">
                        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border bg-accent/5">
                          <span className="text-xs text-muted font-mono w-5 text-right shrink-0">{rowIdx + 1}.</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-accent/10 text-accent px-2 py-0.5">
                            <LinkIcon size={10} /> Group
                          </span>
                          <span className="text-xs font-semibold tabular-nums">Group total: {fmtTotal(row.totalSec)}</span>
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
                {items.length === 0 && addMode === "none" && (
                  <div className="text-xs text-muted text-center py-3 border border-dashed border-border rounded-lg">No exercises yet — tap &quot;Add exercise&quot; or &quot;Add group&quot;.</div>
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
