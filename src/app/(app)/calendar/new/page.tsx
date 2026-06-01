import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { campScope } from "@/lib/access";
import { createTodo } from "@/lib/todos";
import { flashUrl } from "@/lib/flash";
import { CalendarPlus, CheckSquare, StickyNote } from "lucide-react";

export const dynamic = "force-dynamic";

type ItemType = "class" | "todo" | "note";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; date?: string; return?: string }>;
}) {
  const user = await requireCoach();
  const sp = await searchParams;
  const type: ItemType = sp.type === "todo" ? "todo" : sp.type === "note" ? "note" : "class";
  const date = sp.date ?? new Date().toISOString().split("T")[0];
  const returnTo = sp.return ?? "/calendar?view=month";

  const camps =
    type === "class"
      ? await db.camp.findMany({ where: campScope(user), orderBy: { startDate: "desc" }, select: { id: true, name: true } })
      : [];

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

  async function createTodoOrNote(formData: FormData) {
    "use server";
    await requireCoach();
    const title = String(formData.get("title") ?? "").trim();
    const d = String(formData.get("date") ?? "");
    const source = String(formData.get("source") ?? "manual") === "note" ? "note" : "manual";
    if (!title) return;
    await createTodo({ title, dueDate: d ? new Date(`${d}T00:00:00`) : null, source });
    redirect(flashUrl(String(formData.get("returnTo") ?? "/calendar?view=month"), source === "note" ? "Note added" : "To-do added"));
  }

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const meta = {
    class: { title: "New class", icon: CalendarPlus, blurb: "A scheduled session athletes can be rostered into." },
    todo: { title: "New to-do", icon: CheckSquare, blurb: "A task with a checkbox, due on this day." },
    note: { title: "New note", icon: StickyNote, blurb: "A reminder pinned to this day. No checkbox." },
  }[type];

  return (
    <div className="p-8 max-w-xl mx-auto">
      <Link href={returnTo} className="text-sm text-muted hover:text-foreground">← Back to calendar</Link>

      <div className="mt-3 mb-1 flex items-center gap-2">
        <meta.icon size={24} className="text-accent" />
        <h1 className="text-3xl font-semibold tracking-tight">{meta.title}</h1>
      </div>
      <p className="text-sm text-muted mb-1">{meta.blurb}</p>
      <p className="text-sm text-muted mb-5">
        For <span className="font-medium text-foreground">{dateLabel}</span>
      </p>

      {/* Type switcher */}
      <div className="mb-6 inline-flex rounded-lg border border-border overflow-hidden">
        {(["class", "todo", "note"] as ItemType[]).map((t) => {
          const params = new URLSearchParams({ type: t, date, return: returnTo });
          return (
            <Link
              key={t}
              href={`/calendar/new?${params.toString()}`}
              className={`px-4 py-2 text-sm capitalize ${type === t ? "bg-foreground text-white" : "hover:bg-background"}`}
            >
              {t === "todo" ? "To-do" : t}
            </Link>
          );
        })}
      </div>

      {type === "class" ? (
        <form action={createClass} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <Field label="Title">
            <input name="title" required autoFocus className={INPUT} placeholder="e.g. Hyrox conditioning" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" name="date" defaultValue={date} required className={INPUT} /></Field>
            <Field label="Start time"><input type="time" name="time" defaultValue="07:00" required className={INPUT} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
      ) : (
        <form action={createTodoOrNote} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="source" value={type === "note" ? "note" : "manual"} />
          <Field label={type === "note" ? "Note" : "Task"}>
            <input
              name="title"
              required
              autoFocus
              className={INPUT}
              placeholder={type === "note" ? "e.g. Bring extra wall balls" : "e.g. Confirm venue booking"}
            />
          </Field>
          <Field label="Date">
            <input type="date" name="date" defaultValue={date} required className={INPUT} />
          </Field>
          <Actions returnTo={returnTo} submitLabel={type === "note" ? "Add note" : "Add to-do"} />
        </form>
      )}
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
