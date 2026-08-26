"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Archive, CalendarPlus, Pencil, Search } from "lucide-react";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import RoleBadge from "@/components/RoleBadge";
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
  isSubscribed: boolean;
  campNames: string[];
  subscriptionCoachNames: string[];
  segment: "subscription" | "camp" | "other";
};

/**
 * The customers sidebar list with instant client-side search + camp filter.
 * Selecting a customer navigates to ?sel=<id> so the page shows their summary
 * on the right (master-detail) instead of jumping to the full profile.
 */
export default function CustomerList({
  items,
  camps,
  archiveAction,
}: {
  items: CustItem[];
  camps: { id: string; name: string }[];
  archiveAction: (formData: FormData) => void | Promise<void>;
}) {
  const sp = useSearchParams();
  const activeId = sp.get("sel") ?? sp.get("edit");
  const [q, setQ] = useState("");
  const [camp, setCamp] = useState("");
  const [segment, setSegment] = useState<"all" | CustItem["segment"]>("all");

  const ql = q.trim().toLowerCase();
  const filtered = items.filter(
    (c) =>
      (!ql || c.name.toLowerCase().includes(ql) || c.detail.toLowerCase().includes(ql)) &&
      (!camp || c.campIds.includes(camp)) &&
      (segment === "all" || c.segment === segment),
  );
  const counts = {
    all: items.length,
    subscription: items.filter((item) => item.segment === "subscription").length,
    camp: items.filter((item) => item.segment === "camp").length,
    other: items.filter((item) => item.segment === "other").length,
  };
  const segments = [
    { key: "all" as const, label: "All", count: counts.all },
    { key: "subscription" as const, label: "Plans", count: counts.subscription },
    { key: "camp" as const, label: "Camp members", count: counts.camp },
    { key: "other" as const, label: "Other", count: counts.other },
  ];

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
        <div role="group" aria-label="Customer groups" className="grid grid-cols-4 overflow-hidden rounded-lg border border-border bg-background">
          {segments.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={segment === option.key}
              onClick={() => setSegment(option.key)}
              className={`min-w-0 px-1 py-1.5 text-[11px] font-medium transition-colors ${segment === option.key ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}
            >
              <span className="flex min-h-7 items-center justify-center whitespace-normal leading-tight">{option.label}</span>
              <span className="block text-[10px] tabular-nums opacity-70">{option.count}</span>
            </button>
          ))}
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
        {segment === "subscription" && filtered.length > 0 && (
          <Link href="/plans" className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-white hover:opacity-90">
            <CalendarPlus size={14} /> Bulk assign
          </Link>
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
                  {c.accountRole && <RoleBadge role={c.accountRole} size="xs" className="shrink-0" />}
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
              <div className="flex items-center gap-2 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {c.isSubscribed && (
                  <Link
                    href={`/customers?sel=${c.id}&assign=1`}
                    className="text-accent hover:text-foreground"
                    aria-label={`Assign plan to ${c.name}`}
                    title="Assign plan"
                  >
                    <CalendarPlus size={15} />
                  </Link>
                )}
                <Link href={`/customers?edit=${c.id}`} className="text-muted hover:text-foreground" aria-label={`Edit ${c.name}`}><Pencil size={14} /></Link>
                <form action={archiveAction}>
                  <input type="hidden" name="customerId" value={c.id} />
                  <ConfirmSubmit
                    message={`Archive ${c.name}? Their login will be disabled and they will be hidden from active lists. An admin can restore the account.`}
                    className="text-muted hover:text-red-600"
                  >
                    <Archive size={14} />
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-2 text-[11px] text-muted border-t border-border">
        {filtered.length === items.length && segment === "all" ? `${items.length} on roster` : `${filtered.length} of ${items.length}`}
      </div>
    </div>
  );
}
