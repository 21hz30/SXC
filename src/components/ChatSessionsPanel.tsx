"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, MessagesSquare, Pencil, Trash2, User as UserIcon, X } from "lucide-react";

type Session = {
  id: string;
  title: string;
  customerId: string | null;
  customerName: string | null;
  lastMessageAt: string;
};
type Customer = { id: string; name: string };

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ChatSessionsPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeId = searchParams.get("chat");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/chat/sessions");
    if (res.ok) setSessions(await res.json());
  }, []);

  useEffect(() => {
    queueMicrotask(refresh);
    const h = () => refresh();
    window.addEventListener("sxc:sessions-changed", h);
    return () => window.removeEventListener("sxc:sessions-changed", h);
  }, [refresh]);

  function openSession(id: string) {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("chat", id);
    router.push(`${pathname}?${params.toString()}`);
    window.dispatchEvent(new CustomEvent("sxc:open-ai"));
  }

  async function newSession(customerId: string | null) {
    setShowPicker(false);
    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    const s: Session = await res.json();
    await refresh();
    openSession(s.id);
  }

  async function openPicker() {
    if (customers.length === 0) {
      const res = await fetch("/api/customers");
      if (res.ok) setCustomers(await res.json());
    }
    setShowPicker(true);
  }

  async function renameSession(s: Session) {
    const title = prompt("Rename chat", s.title);
    if (!title || title === s.title) return;
    await fetch(`/api/chat/sessions/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    refresh();
  }
  async function removeSession(s: Session) {
    if (!confirm(`Delete "${s.title}"?`)) return;
    await fetch(`/api/chat/sessions/${s.id}`, { method: "DELETE" });
    if (activeId === s.id) {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.delete("chat");
      router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    }
    refresh();
  }

  return (
    <div className="border-t border-border flex-1 min-h-0 flex flex-col">
      <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted uppercase tracking-wide">
          <MessagesSquare size={12} /> Chats
        </div>
        <button onClick={openPicker} className="p-1 text-muted hover:text-foreground rounded hover:bg-background" aria-label="New chat">
          <Plus size={14} />
        </button>
      </div>

      {showPicker && (
        <div className="mx-2 mb-2 bg-background border border-border rounded-lg p-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Chat about…</div>
            <button onClick={() => setShowPicker(false)} className="text-muted hover:text-foreground"><X size={12} /></button>
          </div>
          <div className="space-y-0.5 max-h-48 overflow-auto">
            <button onClick={() => newSession(null)} className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-white">
              <div className="font-medium">General chat</div>
              <div className="text-[11px] text-muted">No customer scope</div>
            </button>
            {customers.map((c) => (
              <button key={c.id} onClick={() => newSession(c.id)} className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-white flex items-center gap-1.5">
                <UserIcon size={11} className="text-muted" /> {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {sessions.length === 0 && !showPicker && (
          <div className="text-center text-xs text-muted py-4 px-2">No chats yet — tap + to start.</div>
        )}
        {sessions.map((s) => {
          const active = activeId === s.id;
          return (
            <div
              key={s.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${active ? "bg-accent/10" : "hover:bg-background"}`}
            >
              <button onClick={() => openSession(s.id)} className="flex-1 min-w-0 text-left">
                <div className={`text-sm font-medium truncate ${active ? "text-accent" : ""}`}>{s.title}</div>
                <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                  {s.customerName && (
                    <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <UserIcon size={8} /> {s.customerName}
                    </span>
                  )}
                  <span>{relTime(s.lastMessageAt)}</span>
                </div>
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                <button onClick={() => renameSession(s)} className="p-1 text-muted hover:text-foreground" title="Rename"><Pencil size={11} /></button>
                <button onClick={() => removeSession(s)} className="p-1 text-muted hover:text-red-600" title="Delete"><Trash2 size={11} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
