import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { campScope } from "@/lib/access";
import { flashUrl } from "@/lib/flash";
import { CalendarPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; return?: string }>;
}) {
  const user = await requireCoach();
  const sp = await searchParams;
  const date = sp.date ?? new Date().toISOString().split("T")[0];
  const returnTo = sp.return ?? "/calendar?view=month";

  const camps = await db.camp.findMany({ where: campScope(user), orderBy: { startDate: "desc" }, select: { id: true, name: true } });

  // ----- server actions -----
  async function createClass(formData: FormData) {
    "use server";
    const u = await requireCoach();
    const title = String(formData.get("title") ?? "").trim();
    const d = String(formData.get("date") ?? "");
    const time = String(formData.get("time") ?? "") || "07:00";
    if (!title || !d) return;
    const campId = String(formData.get("campId") ?? "") || null;
    if (campId && u.role === "coach") {
      const owned = await db.camp.findFirst({ where: { id: campId, coachId: u.id }, select: { id: true } });
      if (!owned) return;
    }
    await db.class.create({
      data: {
        title,
        startsAt: new Date(`${d}T${time}`),
        durationMin: Number(formData.get("durationMin")) || 60,
        capacity: Number(formData.get("capacity")) || 12,
        location: String(formData.get("location") ?? "").trim() || null,
        dropInAllowed: formData.get("dropInAllowed") === "on",
        campId,
        createdById: u.id,
      },
    });
    redirect(flashUrl(String(formData.get("returnTo") ?? "/calendar?view=month"), `Class "${title}" created`));
  }

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl mx-auto">
      <Link href={returnTo} className="text-sm text-muted hover:text-foreground">← Back to calendar</Link>

      <div className="mt-3 mb-1 flex items-center gap-2">
        <CalendarPlus size={24} className="text-accent" />
        <h1 className="text-3xl font-semibold tracking-tight">New class</h1>
      </div>
      <p className="text-sm text-muted mb-1">A scheduled session athletes can be rostered into.</p>
      <p className="text-sm text-muted mb-5">
        For <span className="font-medium text-foreground">{dateLabel}</span>
      </p>

      <form action={createClass} className="mt-6 bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field label="Title">
          <input name="title" required autoFocus className={INPUT} placeholder="e.g. Hyrox conditioning" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Date"><input type="date" name="date" defaultValue={date} required className={INPUT} /></Field>
          <Field label="Start time"><input type="time" name="time" defaultValue="07:00" required className={INPUT} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Duration (min)"><input type="number" name="durationMin" defaultValue={60} min={5} className={INPUT} /></Field>
          <Field label="Capacity"><input type="number" name="capacity" defaultValue={12} min={1} className={INPUT} /></Field>
        </div>
        <Field label="Location (optional)"><input name="location" className={INPUT} placeholder="e.g. Studio A" /></Field>
        <Field label="Camp (optional)">
          <select name="campId" defaultValue="" className={INPUT}>
            <option value="">— No camp —</option>
            {camps.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dropInAllowed" /> Allow drop-ins (athletes outside the camp can join)
        </label>
        <Actions returnTo={returnTo} submitLabel="Create class" />
      </form>
    </div>
  );
}

const INPUT = "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Actions({ returnTo, submitLabel }: { returnTo: string; submitLabel: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2.5 font-medium hover:opacity-90">
        {submitLabel}
      </button>
      <Link href={returnTo} className="text-sm text-muted hover:text-foreground">Cancel</Link>
    </div>
  );
}
