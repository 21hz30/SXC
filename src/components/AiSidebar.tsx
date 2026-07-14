"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Sparkles, Send, ChevronRight, User as UserIcon, MessagesSquare, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useAiPanel } from "@/lib/stores/aiPanel";
import { cn } from "@/lib/utils";
import ChatSessionsPanel from "./ChatSessionsPanel";

// Markdown pulls in react-markdown + remark-gfm (~100KB+). Load it lazily so it
// isn't in every page's bundle — it's only needed once the chat renders a reply.
const Markdown = dynamic(() => import("./Markdown"), { loading: () => null });

type Msg = { role: "user" | "assistant"; content: string };
type Session = {
  id: string;
  title: string;
  customerId: string | null;
  customerName: string | null;
};

const SUGGESTIONS = [
  "Help me plan this week's coaching priorities",
  "Generate a 4-week Hyrox prep camp",
  "What should I focus on this week?",
];

function notifySessionsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sxc:sessions-changed"));
}

export default function AiSidebar({ user }: { user: { name: string; role: string } }) {
  const isStaff = user.role === "admin" || user.role === "coach";
  const open = useAiPanel((s) => s.open);
  const setOpen = useAiPanel((s) => s.setOpen);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Staff can scope a NEW chat to a customer ("project"); athletes just talk.
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [draftCustomerId, setDraftCustomerId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("chat");

  // Staff get the customer list for the "talk about a customer" picker.
  useEffect(() => {
    if (!isStaff) return;
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCustomers(Array.isArray(list) ? list.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : []))
      .catch(() => {});
  }, [isStaff]);

  // Let other UI (e.g. the chat list) open the panel via a custom event.
  // Open/close state itself lives in the Zustand store.
  useEffect(() => {
    const opener = () => setOpen(true);
    window.addEventListener("sxc:open-ai", opener);
    return () => window.removeEventListener("sxc:open-ai", opener);
  }, [setOpen]);

  // Load the active session whenever ?chat=ID changes — but skip the one we just
  // created locally (loadedRef), so we don't clobber an in-flight reply.
  useEffect(() => {
    if (!activeId) {
      if (loadedRef.current !== null) { setSession(null); setMessages([]); loadedRef.current = null; }
      return;
    }
    if (activeId === loadedRef.current) return;
    (async () => {
      const sRes = await fetch("/api/chat/sessions");
      if (!sRes.ok) return;
      const list: Session[] = await sRes.json();
      const found = list.find((s) => s.id === activeId);
      if (!found) { setSession(null); setMessages([]); loadedRef.current = null; return; }
      loadedRef.current = found.id;
      setSession(found);
      const mRes = await fetch(`/api/chat/sessions/${found.id}/messages`);
      setMessages(mRes.ok ? await mRes.json() : []);
    })();
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Opening a session (from the history list or elsewhere) drops back to the chat.
  useEffect(() => { if (activeId) setShowHistory(false); }, [activeId]);

  // Start a brand-new conversation: clear the active session so the next message
  // opens a fresh chat, and leave the history view.
  function startNewChat() {
    const params = new URLSearchParams(window.location.search);
    params.delete("chat");
    router.replace(`${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    loadedRef.current = null;
    setSession(null);
    setMessages([]);
    setShowHistory(false);
    inputRef.current?.focus();
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setInput("");

    // "Just talk": with no chat yet, start one (optionally scoped to a customer
    // the coach picked) so the user never has to select a session first.
    let sess = session;
    let created = false;
    if (!sess) {
      try {
        const res = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: text.replace(/^\//, "").slice(0, 48), customerId: draftCustomerId || null }),
        });
        if (!res.ok) throw new Error("Couldn't start the chat.");
        sess = (await res.json()) as Session;
        created = true;
        loadedRef.current = sess.id;
        setSession(sess);
        setDraftCustomerId("");
        const params = new URLSearchParams(window.location.search);
        params.set("chat", sess.id);
        router.replace(`${window.location.pathname}?${params.toString()}`);
        notifySessionsChanged();
      } catch (e) {
        setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
        return;
      }
    }

    const next: Msg[] = [...(created ? [] : messages), { role: "user", content: text }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sess.id, messages: next }),
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
          // Desktop only — on phones the AI lives in the bottom tab bar instead.
          "fixed right-4 bottom-4 w-12 h-12 rounded-full bg-foreground text-white shadow-lg hidden md:flex items-center justify-center hover:opacity-90 z-50 transition-opacity duration-200",
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
          // End above the mobile bottom nav so it stays visible/tappable.
          "xl:hidden fixed top-0 inset-x-0 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:bottom-0 bg-black/30 z-40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-hidden
      />

      {/* The panel — always mounted, slides in/out from the right */}
      <aside
        className={cn(
          // Full height on desktop; on phones it stops above the bottom nav bar
          // so the nav stays visible and tappable while chatting.
          "fixed top-0 right-0 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:bottom-0 w-full sm:w-96 bg-white border-l border-border flex flex-col z-40 transition-transform duration-300 ease-in-out will-change-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="px-3 py-3 border-b border-border flex items-center gap-1">
          <Sparkles size={16} className="text-accent shrink-0 ml-1" />
          <div className="font-semibold text-sm truncate flex-1 px-1">
            {showHistory ? "Chats" : (session?.title ?? "AI Co-Coach")}
          </div>
          {!showHistory && session?.customerName && (
            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <UserIcon size={10} /> {session.customerName}
            </span>
          )}
          <button onClick={startNewChat} aria-label="New chat" title="New chat" className="text-muted hover:text-foreground p-1.5 rounded hover:bg-background shrink-0">
            <Plus size={18} />
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Chat history"
            title="Chat history"
            className={cn("p-1.5 rounded hover:bg-background shrink-0", showHistory ? "text-accent bg-accent/10" : "text-muted hover:text-foreground")}
          >
            <MessagesSquare size={18} />
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-foreground p-1.5 rounded hover:bg-background shrink-0">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Body — chat history list, past messages, or a welcome when fresh */}
        {showHistory ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <ChatSessionsPanel />
        </div>
        ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground">
                {session ? "Continue the conversation" : "Hi — I'm your AI co-coach. Just ask."}
              </div>
              {isStaff && !session && (
                <div>
                  <label className="block text-[11px] text-muted uppercase tracking-wide mb-1">Talk about (optional)</label>
                  <select
                    value={draftCustomerId}
                    onChange={(e) => setDraftCustomerId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">General — no customer</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <div className="text-xs text-muted uppercase tracking-wide">Try</div>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="block w-full text-left text-sm bg-background border border-border rounded-lg px-3 py-2 hover:border-accent">{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
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
            ))
          )}
        </div>
        )}

        {/* Input — always available, so you can just start talking (hidden in history) */}
        {!showHistory && (
        <div className="relative border-t border-border">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-3 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={session ? "Reply…" : "Ask anything"}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button type="submit" disabled={loading || !input.trim()} className="rounded-lg bg-foreground text-white px-3 disabled:opacity-40 hover:opacity-90">
              <Send size={16} />
            </button>
          </form>
        </div>
        )}
      </aside>
    </>
  );
}
