import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatSec } from "@/lib/utils";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { customerScope, nonStaffCustomerWhere } from "@/lib/access";
import { customerDetail } from "@/domain/customers";
import { createAccount, AccountError } from "@/domain/accounts";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import AccountForm from "@/components/AccountForm";
import TagCombobox from "@/components/TagCombobox";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string; error?: string }> }) {
  const user = await requireCoach();
  const { new: isNew, edit, error } = await searchParams;
  // Exclude staff (admin/coach) profiles — they live on the Team page.
  const customers = await db.customer.findMany({
    where: { ...customerScope(user), ...nonStaffCustomerWhere() },
    orderBy: { name: "asc" },
    include: { rosterEntries: true },
  });
  const editingCustomer = edit ? customers.find((c) => c.id === edit) ?? null : null;
  // Distinct tags already in use, for the tag picker.
  const allCustomerTags = [...new Set(customers.flatMap((c) => (c.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b));

  async function createCustomer(formData: FormData) {
    "use server";
    await requireCoach();
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
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted border-b border-border">All customers</div>
            <ul className="divide-y divide-border max-h-[72vh] overflow-y-auto">
              {customers.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No customers yet.</li>}
              {customers.map((c) => {
                const attended = c.rosterEntries.filter((r) => r.attendance === "attended").length;
                const total = c.rosterEntries.filter((r) => r.attendance !== "pending").length;
                const active = editingCustomer?.id === c.id;
                return (
                  <li key={c.id} className={`group flex items-center gap-2 px-4 py-3 hover:bg-background ${active ? "bg-accent/5" : ""}`}>
                    <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
                      <div className="font-medium truncate hover:text-accent">{c.name}</div>
                      <div className="text-xs text-muted truncate">
                        {customerDetail(c) || c.email || "—"}
                        {c.hyroxPbSec != null && <> · PB {formatSec(c.hyroxPbSec)}</>}
                        {total > 0 && <> · {attended}/{total} att.</>}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100">
                      <Link href={`/customers?edit=${c.id}`} className="text-muted hover:text-foreground" aria-label={`Edit ${c.name}`}><Pencil size={14} /></Link>
                      <form action={deleteCustomer}>
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
          </div>
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
          ) : (
            <div className="hidden lg:flex items-center justify-center text-center bg-card border border-border border-dashed rounded-xl p-10 text-sm text-muted min-h-[16rem]">
              <span>Pick a customer to edit, open one for full details, or <Link href="/customers?new=1" className="text-accent hover:underline">add a new customer</Link>.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
