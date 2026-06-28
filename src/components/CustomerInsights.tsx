"use client";

import { useState, useEffect } from "react";
import { Sparkles, TrendingUp, AlertTriangle, Target, Apple, RefreshCw } from "lucide-react";

type Insights = { headline: string; strengths: string[]; watchOuts: string[]; focus: string[]; nutrition: string };
type Cached = { insights: Insights; model: string; generatedAt: string };

function relTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/**
 * AI coaching insights for one customer — generated on demand, cached in
 * localStorage (per coach's device) so they persist across reloads without any
 * server-side storage. Staff-only; rendered on the customer profile.
 */
export default function CustomerInsights({ customerId, customerName }: { customerId: string; customerName: string }) {
  const key = `sxc:insights:${customerId}`;
  const first = customerName.split(" ")[0];
  const [data, setData] = useState<Cached | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s) setData(JSON.parse(s));
    } catch {}
  }, [key]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/insights`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't generate insights.");
      }
      const d = (await res.json()) as Cached;
      setData(d);
      try { localStorage.setItem(key, JSON.stringify(d)); } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const i = data?.insights;
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent" /> AI insights
        </h2>
        <div className="flex items-center gap-2">
          {data && <span className="text-[11px] text-muted">generated {relTime(data.generatedAt)}</span>}
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border px-2.5 py-1.5 hover:border-accent disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {data ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{error}</div>}

      {!i && !loading && (
        <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted">
          Generate an AI read on {first}&apos;s performance — strengths, what to focus on, and a nutrition tip.
        </div>
      )}
      {loading && !i && (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted">Analysing {first}&apos;s data…</div>
      )}

      {i && (
        <div className={loading ? "space-y-3 opacity-50" : "space-y-3"}>
          {i.headline && <div className="bg-accent/5 border border-accent/20 rounded-xl px-4 py-3 text-sm font-medium">{i.headline}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card icon={TrendingUp} title="Strengths" cls="text-emerald-600" items={i.strengths} />
            <Card icon={AlertTriangle} title="Watch-outs" cls="text-amber-600" items={i.watchOuts} />
            <Card icon={Target} title="Focus next" cls="text-accent" items={i.focus} />
          </div>
          {i.nutrition && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide mb-1.5">
                <Apple size={13} className="text-rose-500" /> Nutrition
              </div>
              <p className="text-sm leading-relaxed">{i.nutrition}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Card({ icon: Icon, title, cls, items }: { icon: typeof TrendingUp; title: string; cls: string; items: string[] }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide mb-2 ${cls}`}>
        <Icon size={13} /> {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted">—</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t, n) => (
            <li key={n} className="text-sm leading-snug flex gap-1.5">
              <span className="text-muted">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
