"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Send, ChevronRight, CheckSquare, User as UserIcon, MessagesSquare } from "lucide-react";
import Markdown from "./Markdown";
import { useAiPanel } from "@/lib/stores/aiPanel";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type Session = {
  id: string;
  title: string;
  customerId: string | null;
  customerName: string | null;
};

const SUGGESTIONS = [
  "Add a todo to film a wall-ball demo tomorrow",
  "Generate a 4-week Hyrox prep camp",
  "What should I focus on this week?",
];

type SlashCmdMeta = { name: string; tool: string; description: string; icon: typeof CheckSquare };
const SLASH_CMDS: SlashCmdMeta[] = [
  { name: "todo", tool: "create_todo", description: "Create a todo. Usage: /todo <title> [due:YYYY-MM-DD]", icon: CheckSquare },
];

function notifyTodosChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sxc:todos-changed"));
}
function notifySessionsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sxc:sessions-changed"));
}
function parseSlashLine(text: string) {
  const m = text.match(/^\/(\w+)\s*(.*)$/);
  return m ? { cmd: m[1].toLowerCase(), rest: m[2] } : null;
}

export default function AiSidebar({ user: _user }: { user: { name: string; role: string } }) {
  const open = useAiPanel((s) => s.open);
  const setOpen = useAiPanel((s) => s.setOpen);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSlash, setShowSlash] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchParams = useSearchParams();
  const activeId = searchParams.get("chat");

  // Default open on xl+, and let other UI (e.g. the chat list) open the panel
  // via a custom event. Open/close state itself lives in the Zustand store.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setOpen(true);
    const opener = () => setOpen(true);
    window.addEventListener("sxc:open-ai", opener);
    return () => window.removeEventListener("sxc:open-ai", opener);
  }, [setOpen]);

  // Load the active session whenever ?chat=ID changes
  useEffect(() => {
    if (!activeId) { setSession(null); setMessages([]); return; }
    (async () => {
      const sRes = await fetch("/api/chat/sessions");
      if (!sRes.ok) return;
      const list: Session[] = await sRes.json();
      const found = list.find((s) => s.id === activeId);
      if (!found) { setSession(null); setMessages([]); return; }
      setSession(found);
      const mRes = await fetch(`/api/chat/sessions/${found.id}/messages`);
      setMessages(mRes.ok ? await mRes.json() : []);
    })();
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function onInputChange(v: string) {
    setInput(v);
    setShowSlash(v.startsWith("/") && !v.includes(" "));
  }

  async function executeSlash(text: string): Promise<boolean> {
    if (!text.startsWith("/")) return false;
    const parsed = parseSlashLine(text);
    if (!parsed) return false;
    const meta = SLASH_CMDS.find((c) => c.name === parsed.cmd);
    if (!meta) {
      setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "Unknown command. Type `/` to see options." }]);
      return true;
    }
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const res = await fetch(`/api/tool/${meta.tool}/slash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rest: parsed.rest }),
      });
      const data: { ok: boolean; message: string } = await res.json();
      const reply = res.ok && data.ok ? `✅ ${data.message}` : `⚠️ ${data.message}`;
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (meta.tool === "create_todo" && data.ok) notifyTodosChanged();
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
    }
    return true;
  }

  async function send(text: string) {
    if (!text.trim() || loading || !session) return;
    setInput("");
    setShowSlash(false);

    if (await executeSlash(text)) return;

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, messages: next }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${txt || "AI request failed."}` }]);
        setLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        assistant += chunk;
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: assistant };
          return copy;
        });
        if (chunk.includes("📌")) notifyTodosChanged();
      }
      notifySessionsChanged(); // title may have auto-updated
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating open button — shown when the panel is closed */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed right-4 bottom-4 w-12 h-12 rounded-full bg-foreground text-white shadow-lg flex items-center justify-center hover:opacity-90 z-50 transition-opacity duration-200",
          open ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
        aria-label="Open AI Co-Coach"
      >
        <Sparkles size={20} />
      </button>

      {/* Mobile overlay — only while open, below xl */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          "xl:hidden fixed inset-0 bg-black/30 z-40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-hidden
      />

      {/* The panel — always mounted, slides in/out from the right */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 w-full sm:w-96 bg-white border-l border-border flex flex-col z-40 transition-transform duration-300 ease-in-out will-change-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Sparkles size={16} className="text-accent shrink-0" />
          <div className="font-semibold text-sm truncate flex-1">
            {session?.title ?? "AI Co-Coach"}
          </div>
          {session?.customerName && (
            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <UserIcon size={10} /> {session.customerName}
            </span>
          )}
          <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground p-1 rounded hover:bg-background">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Body */}
        {!session ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted">
            <MessagesSquare size={28} className="mb-3" />
            <div className="text-sm font-medium text-foreground">No chat selected</div>
            <div className="text-xs mt-1 max-w-[14rem]">Pick a chat from the left sidebar or tap + to start a new one.</div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted uppercase tracking-wide">Try</div>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="block w-full text-left text-sm bg-background border border-border rounded-lg px-3 py-2 hover:border-accent">{s}</button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] bg-foreground text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm whitespace-pre-wrap break-words"
                        : "max-w-[85%] bg-background border border-border rounded-2xl rounded-tl-sm px-3.5 py-2 break-words"
                    }
                  >
                    {m.role === "assistant"
                      ? m.content ? <Markdown>{m.content}</Markdown> : (loading && i === messages.length - 1 ? <span className="text-sm">…</span> : null)
                      : m.content}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative border-t border-border">
              {showSlash && (
                <div className="absolute left-3 right-3 bottom-full mb-2 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                  <div className="px-3 py-2 text-xs text-muted bg-background border-b border-border">Commands</div>
                  {SLASH_CMDS.map((cmd) => (
                    <button key={cmd.name} onClick={() => { setInput(`/${cmd.name} `); setShowSlash(false); inputRef.current?.focus(); }} className="flex items-start gap-3 w-full text-left px-3 py-2.5 hover:bg-background">
                      <cmd.icon size={16} className="text-accent mt-0.5 shrink-0" />
                      <div><div className="text-sm font-medium">/{cmd.name}</div><div className="text-xs text-muted">{cmd.description}</div></div>
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-3 flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setShowSlash(false); }}
                  placeholder="Ask anything or type /"
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button type="submit" disabled={loading || !input.trim()} className="rounded-lg bg-foreground text-white px-3 disabled:opacity-40 hover:opacity-90">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
