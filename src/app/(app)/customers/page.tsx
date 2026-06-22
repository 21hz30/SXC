import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatSec, formatDate } from "@/lib/utils";
import { Plus, Pencil, ExternalLink, Dumbbell, CalendarDays, Timer } from "lucide-react";
import RoleBadge from "@/components/RoleBadge";
import { PLAN_STATE_META, planState, planAdherence } from "@/lib/planStatus";
import { requireCoach } from "@/lib/auth";
import { customerScope } from "@/lib/access";
import { customerDetail } from "@/domain/customers";
import { createAccount, AccountError } from "@/domain/accounts";
import { addCoachAddedConnection } from "@/domain/coachConnections";
import AccountForm from "@/components/AccountForm";
import TagCombobox from "@/components/TagCombobox";
import CustomerList, { type CustItem } from "@/components/CustomerList";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-medium text-foreground truncate">{value}</div>
    </div>
  );
}

const ATT_META: Record<string, { label: string; cls: string }> = {
  attended: { label: "Attended", cls: "bg-emerald-100 text-emerald-700" },
  no_show: { label: "No show", cls: "bg-red-100 text-red-700" },
  late_cancel: { label: "Late", cls: "bg-amber-100 text-amber-700" },
  pending: { label: "Upcoming", cls: "bg-zinc-100 text-zinc-600" },
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string; sel?: string; error?: string }> }) {
  const user = await requireCoach();
  const { new: isNew, edit, sel, error } = await searchParams;
  // Exclude staff (admin/coach) profiles — they live on the Team page.
  const [customers, camps] = await Promise.all([
    db.customer.findMany({
      // Non-staff customers, PLUS any staff who joined a camp as a participant
      // (an admin can coach one camp yet be a member of another) — badged below.
      // AND-combined (not spread) because customerScope can itself return an
      // `OR` for coaches; spreading two `OR` keys would clobber the scope.
      where: {
        AND: [
          customerScope(user),
          { OR: [{ userAccount: null }, { userAccount: { role: "customer" } }, { campMembers: { some: {} } }] },
        ],
      },
      orderBy: { name: "asc" },
      include: { rosterEntries: true, campMembers: { select: { campId: true } }, userAccount: { select: { role: true } } },
    }),
    db.camp.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  // Roster-wide plan adherence: pull every customer's assignment status+date in
  // one shot, then compute the % per customer in JS so the list can show it.
  const adherenceRows = customers.length
    ? await db.workoutAssignment.findMany({
        where: { customerId: { in: customers.map((c) => c.id) } },
        select: { customerId: true, status: true, scheduledDate: true },
      })
    : [];
  const planTodayEnd = new Date(); planTodayEnd.setHours(23, 59, 59, 999);
  const adherenceByCust = new Map<string, { due: number; done: number }>();
  for (const r of adherenceRows) {
    if (!r.scheduledDate || r.scheduledDate > planTodayEnd) continue;
    const a = adherenceByCust.get(r.customerId) ?? { due: 0, done: 0 };
    a.due += 1;
    if (r.status === "completed") a.done += 1;
    adherenceByCust.set(r.customerId, a);
  }
  const editingCustomer = edit ? customers.find((c) => c.id === edit) ?? null : null;
  const selectedCustomer = sel ? customers.find((c) => c.id === sel) ?? null : null;
  // Distinct tags already in use, for the tag picker.
  const allCustomerTags = [...new Set(customers.flatMap((c) => (c.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b));

  // Serializable rows for the client-side search/filter list.
  const listItems: CustItem[] = customers.map((c) => {
    const a = adherenceByCust.get(c.id);
    return {
      id: c.id,
      name: c.name,
      detail: customerDetail(c) || c.email || "—",
      pbSec: c.hyroxPbSec ?? null,
      attended: c.rosterEntries.filter((r) => r.attendance === "attended").length,
      total: c.rosterEntries.filter((r) => r.attendance !== "pending").length,
      campIds: c.campMembers.map((m) => m.campId),
      accountRole: c.userAccount?.role === "admin" || c.userAccount?.role === "coach" ? c.userAccount.role : null,
      adherencePct: a && a.due > 0 ? Math.round((a.done / a.due) * 100) : null,
      adherenceDue: a?.due ?? 0,
    };
  });

  // Rich at-a-glance data for the selected customer's summary panel: their plan
  // adherence + recent plan items, recent classes, and any mock-test results.
  const selData = selectedCustomer
    ? await (async () => {
        const [planRows, classRows, mockRows] = await Promise.all([
          db.workoutAssignment.findMany({
            where: { customerId: selectedCustomer.id },
            orderBy: { scheduledDate: "desc" },
            take: 60,
            include: { workout: { select: { id: true, name: true } } },
          }),
          db.rosterEntry.findMany({
            where: { customerId: selectedCustomer.id },
            orderBy: { class: { startsAt: "desc" } },
            take: 5,
            include: { class: { select: { id: true, title: true, startsAt: true } } },
          }),
          db.mockResult.findMany({
            where: { customerId: selectedCustomer.id },
            orderBy: { recordedAt: "desc" },
            take: 4,
            include: { class: { select: { id: true, title: true, startsAt: true } } },
          }),
        ]);
        // Show the recent window oldest→newest (ascending) so it reads as a timeline.
        return { plan: planAdherence(planRows), planItems: planRows.slice(0, 5).reverse(), classes: classRows, mocks: mockRows };
      })()
    : null;
  const selItem = selectedCustomer ? listItems.find((i) => i.id === selectedCustomer.id) ?? null : null;

  async function createCustomer(formData: FormData) {
    "use server";
    const actor = await requireCoach();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) redirect("/customers?new=1&error=name");
    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const tags = String(formData.get("tags") ?? "").trim() || null;

    // A customer gets a login account too (same as admin/coach creation).
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!/^[a-z0-9]{3,}$/.test(username)) redirect("/customers?new=1&error=username");
    if (!(password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password))) redirect("/customers?new=1&error=weak");
    if (await db.user.findUnique({ where: { username } })) redirect("/customers?new=1&error=dupuser");

    // Phone is our human-facing unique handle: if given, it must be unique.
    if (phone) {
      const dupePhone = await db.customer.findFirst({ where: { phone } });
      if (dupePhone) redirect("/customers?new=1&error=phone");
    }
    // If the name already exists, require something to tell the two apart.
    const sameName = await db.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (sameName && !phone && !email && !tags) redirect("/customers?new=1&error=dupename");

    const c = await db.customer.create({
      data: {
        name,
        email,
        phone,
        age: Number(formData.get("age")) || null,
        weightKg: Number(formData.get("weightKg")) || null,
        heightCm: Number(formData.get("heightCm")) || null,
        tags,
      },
    });
    // Create the linked login. If it fails (e.g. username taken in a race),
    // roll back the just-created profile so we don't leave an account-less one.
    try {
      await createAccount({ username, password, name, role: "customer", email, customerId: c.id });
    } catch (e) {
      await db.customer.delete({ where: { id: c.id } }).catch(() => {});
      if (e instanceof AccountError) redirect("/customers?new=1&error=dupuser");
      throw e;
    }
    // A COACH who adds an athlete is immediately connected to them — otherwise
    // multi-tenant scoping would hide the athlete they just created. Admins see
    // every customer, so they need no link.
    if (actor.role === "coach") await addCoachAddedConnection(c.id, actor.id);
    revalidatePath("/customers");
    redirect(flashUrl(`/customers/${c.id}`, `${c.name} added with login “${username}”`));
  }

  async function updateCustomer(formData: FormData) {
    "use server";
    await requireCoach();
    const customerId = String(formData.get("customerId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (!customerId || !name) redirect(`/customers?edit=${encodeURIComponent(customerId)}&error=name`);
    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const tags = String(formData.get("tags") ?? "").trim() || null;

    if (phone) {
      const dupePhone = await db.customer.findFirst({
        where: { phone, NOT: { id: customerId } },
        select: { id: true },
      });
      if (dupePhone) redirect(`/customers?edit=${encodeURIComponent(customerId)}&error=phone`);
    }
    const sameName = await db.customer.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        NOT: { id: customerId },
      },
      select: { id: true },
    });
    if (sameName && !phone && !email && !tags) redirect(`/customers?edit=${encodeURIComponent(customerId)}&error=dupename`);

    const updated = await db.customer.update({
      where: { id: customerId },
      data: {
        name,
        email,
        phone,
        age: Number(formData.get("age")) || null,
        weightKg: Number(formData.get("weightKg")) || null,
        heightCm: Number(formData.get("heightCm")) || null,
        tags,
      },
    });
    revalidatePath("/customers");
    redirect(flashUrl("/customers", `${updated.name} updated`));
  }

  async function deleteCustomer(formData: FormData) {
    "use server";
    await requireCoach();
    const customerId = String(formData.get("customerId") ?? "");
    if (!customerId) return;
    // Remove the whole person: their profile (related rows — benchmarks, races,
    // goals, activity, roster, camp memberships, performances, logs — cascade)
    // AND any linked login account, so no orphaned login is left behind.
    const linked = await db.user.findFirst({ where: { customerId }, select: { id: true } });
    const removed = await db.customer.delete({ where: { id: customerId } });
    if (linked) await db.user.delete({ where: { id: linked.id } }).catch(() => {});
    revalidatePath("/customers");
    revalidatePath("/coaches");
    redirect(flashUrl("/customers", `${removed.name} deleted`));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
          <div className="text-sm text-muted mt-1">{customers.length} on roster</div>
        </div>
        <Link href="/customers?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> Add customer
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Customers list — a sidebar (left on desktop; below the form on mobile) */}
        <aside className="lg:col-span-1 order-2 lg:order-1">
          <CustomerList items={listItems} camps={camps} deleteAction={deleteCustomer} />
        </aside>

        {/* Main content — the add/edit form, or a hint on desktop */}
        <div className="lg:col-span-2 order-1 lg:order-2 space-y-6">
          {isNew ? (
            <AccountForm action={createCustomer} error={error} cancelHref="/customers" submitLabel="Create customer" />
          ) : editingCustomer ? (
            <form action={updateCustomer} className="bg-card border border-border rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {error && (
                <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error === "phone"
                    ? "That phone number is already used by another customer."
                    : error === "dupename"
                    ? "A customer with this name already exists. Add a phone, email, or tag to tell them apart."
                    : "Please enter a name."}
                </div>
              )}
              <input type="hidden" name="customerId" value={editingCustomer.id} />
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1.5">Name *</label>
                <input name="name" required defaultValue={editingCustomer.name} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              </div>
              <div><label className="block text-sm font-medium mb-1.5">Email</label><input name="email" type="email" defaultValue={editingCustomer.email ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Phone</label>
                <input name="phone" defaultValue={editingCustomer.phone ?? ""} placeholder="Used to keep customers unique" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              </div>
              <div><label className="block text-sm font-medium mb-1.5">Age</label><input name="age" type="number" defaultValue={editingCustomer.age ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Weight (kg)</label><input name="weightKg" type="number" step="0.1" defaultValue={editingCustomer.weightKg ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Height (cm)</label><input name="heightCm" type="number" step="0.1" defaultValue={editingCustomer.heightCm ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Tags</label>
                <TagCombobox name="tags" defaultValue={(editingCustomer.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)} suggestions={allCustomerTags} placeholder="Choose or create a tag…" />
              </div>
              <div className="col-span-2 flex gap-2 justify-end">
                <Link href="/customers" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Save changes</button>
              </div>
            </form>
          ) : selectedCustomer ? (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold tracking-tight truncate flex items-center gap-2">
                    <span className="truncate">{selectedCustomer.name}</span>
                    {selectedCustomer.userAccount?.role && selectedCustomer.userAccount.role !== "customer" && (
                      <RoleBadge role={selectedCustomer.userAccount.role} className="shrink-0" />
                    )}
                  </h2>
                  <div className="text-sm text-muted mt-0.5 truncate">{customerDetail(selectedCustomer) || "—"}</div>
                  {selectedCustomer.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedCustomer.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} className="text-[11px] bg-accent/10 text-accent rounded-full px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/customers?edit=${selectedCustomer.id}`} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-background"><Pencil size={14} /> Edit</Link>
                  <Link href={`/customers/${selectedCustomer.id}`} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-foreground text-white hover:opacity-90"><ExternalLink size={14} /> Full profile</Link>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <Fact label="Email" value={selectedCustomer.email || "—"} />
                <Fact label="Phone" value={selectedCustomer.phone || "—"} />
                <Fact label="Hyrox PB" value={selectedCustomer.hyroxPbSec != null ? formatSec(selectedCustomer.hyroxPbSec) : "—"} />
                <Fact label="Attendance" value={selItem && selItem.total > 0 ? `${selItem.attended}/${selItem.total}` : "—"} />
              </div>

              {selData && (
                <div className="space-y-4">
                  {/* Training plan: adherence + recent items with feedback */}
                  <div className="rounded-xl border border-border p-4">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide mb-2"><Dumbbell size={12} /> Training plan</div>
                    {selData.plan.pct == null ? (
                      <div className="text-sm text-muted">No training plan assigned yet.</div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap text-xs mb-2">
                          <span className="text-xl font-semibold text-foreground">{selData.plan.pct}%</span>
                          <span className="text-muted">of due done</span>
                          <span className="rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">{selData.plan.done} done</span>
                          {selData.plan.missed > 0 && <span className="rounded-full px-2 py-0.5 bg-red-100 text-red-700">{selData.plan.missed} missed</span>}
                          {selData.plan.upcoming > 0 && <span className="rounded-full px-2 py-0.5 bg-background border border-border text-muted">{selData.plan.upcoming} upcoming</span>}
                        </div>
                        <div className="divide-y divide-border">
                          {selData.planItems.map((a) => {
                            const st = planState(a);
                            const meta = PLAN_STATE_META[st];
                            const fb = st === "done" && (a.rpe != null || a.feeling) ? [a.rpe != null ? `RPE ${a.rpe}` : null, a.feeling].filter(Boolean).join(" · ") : null;
                            return (
                              <div key={a.id} className="flex items-center gap-2 py-1.5">
                                <span className="w-12 shrink-0 text-[11px] text-muted tabular-nums">{a.scheduledDate ? new Date(a.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                                <Link href={`/workouts/${a.workout.id}`} className="min-w-0 flex-1 text-sm truncate hover:text-accent">{a.workout.name}{fb && <span className="text-[11px] text-muted"> · {fb}</span>}</Link>
                                <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <Link href={`/customers/${selectedCustomer.id}`} className="inline-block mt-2 text-xs text-accent hover:underline">Full training log →</Link>
                  </div>

                  {/* Recent classes attended */}
                  {selData.classes.length > 0 && (
                    <div className="rounded-xl border border-border p-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide mb-2"><CalendarDays size={12} /> Recent classes</div>
                      <div className="divide-y divide-border">
                        {selData.classes.map((r) => {
                          // A past class never marked is "Finished", not "Upcoming".
                          const past = new Date(r.class.startsAt) < new Date();
                          const att = r.attendance === "pending" && past
                            ? { label: "Finished", cls: "bg-zinc-100 text-zinc-600" }
                            : ATT_META[r.attendance] ?? ATT_META.pending;
                          return (
                            <Link key={r.id} href={`/classes/${r.classId}`} className="flex items-center gap-2 py-1.5 -mx-1 px-1 rounded hover:bg-background">
                              <span className="min-w-0 flex-1">
                                <span className="text-sm font-medium truncate block">{r.class.title}</span>
                                <span className="text-[11px] text-muted">{formatDate(r.class.startsAt)}</span>
                              </span>
                              <span className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ${att.cls}`}>{att.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mock-test results */}
                  {selData.mocks.length > 0 && (
                    <div className="rounded-xl border border-border p-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide mb-2"><Timer size={12} /> Simulation races</div>
                      <div className="divide-y divide-border">
                        {selData.mocks.map((m) => {
                          let splits = 0;
                          try { splits = m.timesJson ? Object.keys(JSON.parse(m.timesJson) as Record<string, number>).length : 0; } catch {}
                          return (
                            <Link key={m.id} href={`/classes/${m.classId}`} className="flex items-center gap-2 py-1.5 -mx-1 px-1 rounded hover:bg-background">
                              <span className="min-w-0 flex-1">
                                <span className="text-sm font-medium truncate block">{m.class.title}</span>
                                <span className="text-[11px] text-muted">{formatDate(m.class.startsAt)}{splits > 0 ? ` · ${splits} splits` : ""}</span>
                              </span>
                              {m.totalSec != null && <span className="shrink-0 text-sm font-semibold tabular-nums">{formatSec(m.totalSec)}</span>}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="hidden lg:flex items-center justify-center text-center bg-card border border-border border-dashed rounded-xl p-10 text-sm text-muted min-h-[16rem]">
              <span>Pick a customer to see their summary, or <Link href="/customers?new=1" className="text-accent hover:underline">add a new customer</Link>.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
