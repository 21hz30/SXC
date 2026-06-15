"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2, Search } from "lucide-react";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { formatSec } from "@/lib/utils";

export type CustItem = {
  id: string;
  name: string;
  detail: string;
  pbSec: number | null;
  attended: number;
  total: number;
  campIds: string[];
  accountRole: string | null; // "admin" | "coach" when this is a staff member in a camp
  /** % of due training-plan items they've completed (null = nothing due yet) */
  adherencePct: number | null;
  /** Total assignments that were due (scheduled today or earlier) — for context */
  adherenceDue: number;
};

/**
 * The customers sidebar list with instant client-side search + camp filter.
 * Selecting a customer navigates to ?sel=<id> so the page shows their summary
 * on the right (master-detail) instead of jumping to the full profile.
 */
export default function CustomerList({
  items,
  camps,
  deleteAction,
}: {
  items: CustItem[];
  camps: { id: string; name: string }[];
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const sp = useSearchParams();
  const activeId = sp.get("sel") ?? sp.get("edit");
  const [q, setQ] = useState("");
  const [camp, setCamp] = useState("");

  const ql = q.trim().toLowerCase();
  const filtered = items.filter(
    (c) =>
      (!ql || c.name.toLowerCase().includes(ql) || c.detail.toLowerCase().includes(ql)) &&
      (!camp || c.campIds.includes(camp)),
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or contact…"
            className="w-full rounded-lg border border-border pl-8 pr-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        {camps.length > 0 && (
          <select
            value={camp}
            onChange={(e) => setCamp(e.target.value)}
            className="w-full rounded-lg border border-border px-2 py-1.5 text-sm bg-white"
          >
            <option value="">All camps</option>
            {camps.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
      <ul className="divide-y divide-border max-h-[64vh] overflow-y-auto">
        {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No customers match.</li>}
        {filtered.map((c) => {
          const active = activeId === c.id;
          return (
            <li key={c.id} className={`group flex items-center gap-2 px-4 py-3 hover:bg-background ${active ? "bg-accent/5" : ""}`}>
              <Link href={`/customers?sel=${c.id}`} className="min-w-0 flex-1">
                <div className={`font-medium truncate flex items-center gap-1.5 ${active ? "text-accent" : "hover:text-accent"}`}>
                  <span className="truncate">{c.name}</span>
                  {c.accountRole && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide rounded px-1 py-0.5 bg-violet-100 text-violet-700 capitalize">{c.accountRole}</span>}
                  {c.adherencePct != null && (
                    <span
                      title={`${c.adherencePct}% of ${c.adherenceDue} due training items completed`}
                      className={`shrink-0 text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 ${
                        c.adherencePct >= 80 ? "bg-emerald-100 text-emerald-700"
                          : c.adherencePct >= 50 ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >{c.adherencePct}%</span>
                  )}
                </div>
                <div className="text-xs text-muted truncate">
                  {c.detail}
                  {c.pbSec != null && <> · PB {formatSec(c.pbSec)}</>}
                  {c.total > 0 && <> · {c.attended}/{c.total} att.</>}
                </div>
              </Link>
              <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100">
                <Link href={`/customers?edit=${c.id}`} className="text-muted hover:text-foreground" aria-label={`Edit ${c.name}`}><Pencil size={14} /></Link>
                <form action={deleteAction}>
                  <input type="hidden" name="customerId" value={c.id} />
                  <ConfirmSubmit
                    message={`Delete ${c.name}? This permanently removes their benchmarks, race results, activity and roster history. This cannot be undone.`}
                    className="text-muted hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-2 text-[11px] text-muted border-t border-border">
        {filtered.length === items.length ? `${items.length} on roster` : `${filtered.length} of ${items.length}`}
      </div>
    </div>
  );
}
