import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatTime } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import CampSchedule from "@/components/CampSchedule";
import { requireCoach } from "@/lib/auth";
import { canAccessCamp } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function CampDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireCoach();
  const { id } = await params;
  const { edit } = await searchParams;
  const camp = await db.camp.findUnique({
    where: { id },
    include: {
      coach: true,
      members: { include: { customer: true } },
      classes: {
        orderBy: { startsAt: "asc" },
        include: {
          workouts: { orderBy: { order: "asc" }, include: { workout: { select: { id: true, name: true } } } },
          roster: true,
        },
      },
    },
  });
  if (!camp) notFound();
  if (!canAccessCamp(user, camp)) redirect("/camps");

  const allCustomers = await db.customer.findMany({ orderBy: { name: "asc" } });
  const allWorkouts = await db.workout.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, description: true, items: { select: { id: true } } } });
  const coaches = edit ? await db.user.findMany({ where: { role: { in: ["admin", "coach"] } }, orderBy: { name: "asc" } }) : [];
  const memberIds = new Set(camp.members.map((m) => m.customerId));

  async function updateCamp(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const startDate = String(formData.get("startDate") ?? "");
    const endDate = String(formData.get("endDate") ?? "");
    if (!name || !startDate || !endDate) return;
    await db.camp.update({
      where: { id },
      data: {
        name,
        description: String(formData.get("description") ?? "").trim() || null,
        division: String(formData.get("division") ?? "open") === "pro" ? "pro" : "open",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        coachId: String(formData.get("coachId") ?? "") || null,
      },
    });
    revalidatePath(`/camps/${id}`);
    revalidatePath("/camps");
    redirect(`/camps/${id}`);
  }

  async function deleteCamp() {
    "use server";
    await db.camp.delete({ where: { id } });
    revalidatePath("/camps");
    redirect("/camps");
  }

  async function addMember(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customerId"));
    if (customerId) await db.campMember.create({ data: { campId: id, customerId } });
    revalidatePath(`/camps/${id}`);
  }
  async function removeMember(formData: FormData) {
    "use server";
    const memberId = String(formData.get("memberId"));
    await db.campMember.delete({ where: { id: memberId } });
    revalidatePath(`/camps/${id}`);
  }
  async function addClass(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const date = String(formData.get("date") ?? "");
    const time = String(formData.get("time") ?? "") || "07:00";
    if (!title || !date) return;
    await db.class.create({
      data: {
        campId: id,
        title,
        startsAt: new Date(`${date}T${time}`),
        durationMin: Number(formData.get("durationMin")) || 60,
        capacity: Number(formData.get("capacity")) || 12,
        location: String(formData.get("location") ?? "").trim() || null,
        dropInAllowed: formData.get("dropInAllowed") === "on",
      },
    });
    revalidatePath(`/camps/${id}`);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton fallback="/camps" label="Back" />
      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{camp.name}</h1>
            <span className={`text-[11px] font-semibold uppercase tracking-wide rounded px-2 py-1 ${camp.division === "pro" ? "bg-accent/10 text-accent" : "bg-zinc-100 text-zinc-600"}`}>
              {camp.division === "pro" ? "Pro" : "Open"}
            </span>
          </div>
          <div className="text-sm text-muted mt-1">{camp.description}</div>
          <div className="text-sm text-muted mt-2">
            {formatDate(camp.startDate)} → {formatDate(camp.endDate)} · Coach: {camp.coach?.name ?? "Unassigned"}
          </div>
        </div>
        <Link href={edit ? `/camps/${id}` : `/camps/${id}?edit=1`} className="text-xs text-accent hover:underline shrink-0 mt-1">
          {edit ? "Cancel" : "Edit camp"}
        </Link>
      </header>

      {edit && (
        <>
          <form action={updateCamp} className="bg-card border border-border rounded-xl p-5 mb-3 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-muted mb-1">Name</label>
              <input name="name" required defaultValue={camp.name} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-muted mb-1">Description</label>
              <textarea name="description" rows={2} defaultValue={camp.description ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Type</label>
              <select name="division" defaultValue={camp.division} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="open">Open</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Coach</label>
              <select name="coachId" defaultValue={camp.coachId ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">— unassigned —</option>
                {coaches.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Start date</label>
              <input name="startDate" type="date" required defaultValue={camp.startDate.toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">End date</label>
              <input name="endDate" type="date" required defaultValue={camp.endDate.toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <Link href={`/camps/${id}`} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</Link>
              <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">Save</button>
            </div>
          </form>
          <form action={deleteCamp} className="mb-6 text-right">
            <button type="submit" className="text-xs text-muted hover:text-red-600">Delete this camp</button>
          </form>
        </>
      )}

      <section className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Members ({camp.members.length})</h2>
        <ul className="divide-y divide-border -mx-2 mb-3">
          {camp.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-2 py-2">
              <Link href={`/customers/${m.customerId}`} className="text-sm font-medium hover:text-accent">{m.customer.name}</Link>
              <form action={removeMember}>
                <input type="hidden" name="memberId" value={m.id} />
                <button type="submit" className="text-xs text-muted hover:text-red-600">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addMember} className="flex gap-2">
          <select name="customerId" className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm">
            <option value="">+ Add member…</option>
            {allCustomers.filter((c) => !memberIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm">Add</button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Schedule</h2>
        <form action={addClass} className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-muted mb-1">Class title</label>
            <input name="title" required placeholder="e.g. Pro Team Strength" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Date</label>
            <input name="date" type="date" required defaultValue={camp.startDate.toISOString().slice(0, 10)} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Time</label>
            <input name="time" type="time" defaultValue="07:00" className="rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="w-20">
            <label className="block text-xs text-muted mb-1">Capacity</label>
            <input name="capacity" type="number" defaultValue={12} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="w-32">
            <label className="block text-xs text-muted mb-1">Location</label>
            <input name="location" placeholder="optional" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted pb-2 cursor-pointer">
            <input type="checkbox" name="dropInAllowed" className="rounded border-border" />
            Allow drop-ins
          </label>
          <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">Add class</button>
        </form>
        <CampSchedule
          workouts={allWorkouts.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            itemCount: w.items.length,
          }))}
          classes={camp.classes.map((c) => ({
            id: c.id,
            title: c.title,
            startsAtLabel: `${formatDate(c.startsAt)} · ${formatTime(c.startsAt)}`,
            workouts: c.workouts.map((cw) => ({ id: cw.workout.id, name: cw.workout.name })),
            rosterCount: c.roster.length,
            capacity: c.capacity,
            dropInAllowed: c.dropInAllowed,
          }))}
        />
      </section>
    </div>
  );
}
