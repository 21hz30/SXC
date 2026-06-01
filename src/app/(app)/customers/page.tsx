import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatSec } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { customerScope } from "@/lib/access";
import { customerDetail } from "@/domain/customers";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ new?: string; error?: string }> }) {
  const user = await requireCoach();
  const { new: isNew, error } = await searchParams;
  const customers = await db.customer.findMany({
    where: customerScope(user),
    orderBy: { name: "asc" },
    include: { rosterEntries: true },
  });

  async function createCustomer(formData: FormData) {
    "use server";
    await requireCoach();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) redirect("/customers?new=1&error=name");
    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const tags = String(formData.get("tags") ?? "").trim() || null;

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
    revalidatePath("/customers");
    redirect(flashUrl(`/customers/${c.id}`, `${c.name} added`));
  }

  async function deleteCustomer(formData: FormData) {
    "use server";
    await requireCoach();
    const customerId = String(formData.get("customerId") ?? "");
    if (!customerId) return;
    // Related rows (benchmarks, races, goals, activity, videos, roster, camp
    // memberships, performances, logs) cascade; any login account is detached.
    const removed = await db.customer.delete({ where: { id: customerId } });
    revalidatePath("/customers");
    redirect(flashUrl("/customers", `${removed.name} deleted`));
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
          <div className="text-sm text-muted mt-1">{customers.length} on roster</div>
        </div>
        <Link href="/customers?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> Add customer
        </Link>
      </header>

      {isNew && (
        <form action={createCustomer} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-2 gap-4">
          {error && (
            <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error === "phone"
                ? "That phone number is already used by another customer."
                : error === "dupename"
                ? "A customer with this name already exists. Add a phone, email, or tag to tell them apart."
                : "Please enter a name."}
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Name *</label>
            <input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div><label className="block text-sm font-medium mb-1.5">Email</label><input name="email" type="email" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Phone</label>
            <input name="phone" placeholder="Used to keep customers unique" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div><label className="block text-sm font-medium mb-1.5">Age</label><input name="age" type="number" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Weight (kg)</label><input name="weightKg" type="number" step="0.1" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Height (cm)</label><input name="heightCm" type="number" step="0.1" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Tags (comma-separated)</label><input name="tags" placeholder="competing,Oct" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div className="col-span-2 flex gap-2 justify-end">
            <Link href="/customers" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Create</button>
          </div>
        </form>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-background text-muted">
            <tr className="text-left">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Tags</th>
              <th className="px-5 py-3 font-medium">Hyrox PB</th>
              <th className="px-5 py-3 font-medium text-right">Attendance</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {customers.map((c) => {
              const attended = c.rosterEntries.filter((r) => r.attendance === "attended").length;
              const total = c.rosterEntries.filter((r) => r.attendance !== "pending").length;
              return (
                <tr key={c.id} className="hover:bg-background group">
                  <td className="px-5 py-4">
                    <Link href={`/customers/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                    <div className="text-xs text-muted">{customerDetail(c) || c.email || "—"}</div>
                  </td>
                  <td className="px-5 py-4 text-muted">{c.tags ?? "—"}</td>
                  <td className="px-5 py-4 tabular-nums">{formatSec(c.hyroxPbSec)}</td>
                  <td className="px-5 py-4 text-right tabular-nums">{attended}/{total}</td>
                  <td className="px-5 py-4 text-right">
                    <form action={deleteCustomer}>
                      <input type="hidden" name="customerId" value={c.id} />
                      <ConfirmSubmit
                        message={`Delete ${c.name}? This permanently removes their benchmarks, race results, activity and roster history. This cannot be undone.`}
                        className="text-muted hover:text-red-600 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </ConfirmSubmit>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
