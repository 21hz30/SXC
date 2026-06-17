"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Trash2, Pencil, Plus, X, Calendar as CalIcon, Sparkles } from "lucide-react";
import { toast } from "@/components/Toaster";

export type TodoItem = {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  source: string;
};

function fmt(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.round((date.getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d: string | null, done: boolean) {
  if (done || !d) return false;
  return new Date(d) < new Date(new Date().toDateString());
}

export default function TodoList({ todos: initial }: { todos: TodoItem[] }) {
  const [todos, setTodos] = useState<TodoItem[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/todos");
      if (res.ok) setTodos(await res.json());
    } catch { /* ignore */ }
  }, []);

  // Listen for AI/slash-created todos
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("sxc:todos-changed", handler);
    return () => window.removeEventListener("sxc:todos-changed", handler);
  }, [refresh]);

  async function callAction(action: string, fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    await fetch(`/api/todo/${action}`, { method: "POST", body: fd });
    const msg: Record<string, string> = { create: "To-do added", delete: "To-do deleted", update: "To-do updated" };
    if (msg[action]) toast(msg[action]);
    await refresh();
  }

  const active = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">My Todos</h2>
          <div className="text-xs text-muted mt-0.5">{active.length} open · {done.length} done</div>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="rounded-lg bg-foreground text-white px-3 py-2 text-sm font-medium flex items-center gap-1.5 hover:opacity-90"
        >
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          {showAdd ? "Cancel" : "Add"}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            if (!title) return;
            await callAction("create", { title, dueDate: String(fd.get("dueDate") ?? "") });
            setShowAdd(false);
          }}
          className="flex gap-2 mb-4 bg-background border border-border rounded-xl p-3"
        >
          <input
            name="title"
            autoFocus
            placeholder="What needs doing?"
            className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input name="dueDate" type="date" className="rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-foreground text-white px-4 text-sm">Add</button>
        </form>
      )}

      <ul className="divide-y divide-border -mx-2">
        {active.length === 0 && !showAdd && (
          <li className="px-2 py-6 text-center text-sm text-muted">All done — nothing on your list 🎉</li>
        )}
        {active.map((t) =>
          editingId === t.id ? (
            <li key={t.id} className="px-2 py-2">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  await callAction("update", { id: t.id, title: String(fd.get("title") ?? ""), dueDate: String(fd.get("dueDate") ?? "") });
                  setEditingId(null);
                }}
                className="flex gap-2"
              >
                <input name="title" defaultValue={t.title} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" />
                <input name="dueDate" type="date" defaultValue={t.dueDate?.slice(0, 10) ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm" />
                <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm">Save</button>
                <button type="button" onClick={() => setEditingId(null)} className="text-muted px-2"><X size={14} /></button>
              </form>
            </li>
          ) : (
            <li key={t.id} className="px-2 py-2.5 flex items-center gap-3 group">
              <button
                onClick={() => {
                  // optimistic
                  setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
                  callAction("toggle", { id: t.id });
                }}
                // Pseudo-element extends the tap target to 40×40 without
                // growing the layout box — see PlanExerciseChecklist for rationale.
                className="relative w-5 h-5 rounded-md border-2 border-border hover:border-orange-500 shrink-0 touch-manipulation before:absolute before:-inset-2.5 before:content-['']"
                aria-label="Toggle"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {t.title}
                  {t.source === "ai" && <Sparkles size={12} className="text-accent" />}
                </div>
                {t.dueDate && (
                  <div className={`text-xs flex items-center gap-1 mt-0.5 ${isOverdue(t.dueDate, t.done) ? "text-red-600" : "text-muted"}`}>
                    <CalIcon size={11} />
                    {fmt(t.dueDate)}
                  </div>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => setEditingId(t.id)} className="p-1.5 text-muted hover:text-foreground"><Pencil size={14} /></button>
                <button
                  onClick={() => {
                    if (!confirm(`Delete to-do "${t.title}"?`)) return;
                    setTodos((cur) => cur.filter((x) => x.id !== t.id));
                    callAction("delete", { id: t.id });
                  }}
                  className="p-1.5 text-muted hover:text-red-600"
                ><Trash2 size={14} /></button>
              </div>
            </li>
          )
        )}
      </ul>

      {done.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-muted cursor-pointer hover:text-foreground">Completed ({done.length})</summary>
          <ul className="divide-y divide-border -mx-2 mt-2">
            {done.map((t) => (
              <li key={t.id} className="px-2 py-2 flex items-center gap-3 group">
                <button
                  onClick={() => {
                    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: false } : x)));
                    callAction("toggle", { id: t.id });
                  }}
                  // Pseudo-element extends tap area to 40×40 — see PlanExerciseChecklist.
                  className="relative w-5 h-5 rounded-md bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center shrink-0 text-white touch-manipulation before:absolute before:-inset-2.5 before:content-['']"
                  aria-label="Untoggle"
                >
                  <Check size={12} />
                </button>
                <div className="flex-1 text-sm text-muted line-through truncate">{t.title}</div>
                <button
                  onClick={() => {
                    if (!confirm(`Delete to-do "${t.title}"?`)) return;
                    setTodos((cur) => cur.filter((x) => x.id !== t.id));
                    callAction("delete", { id: t.id });
                  }}
                  className="p-1.5 text-muted hover:text-red-600 opacity-0 group-hover:opacity-100"
                ><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
