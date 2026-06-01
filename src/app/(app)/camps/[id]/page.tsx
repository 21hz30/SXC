import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatTime } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import CampSchedule from "@/components/CampSchedule";
import { requireCoach, requireUser } from "@/lib/auth";
import { canAccessCamp } from "@/lib/access";
import { customerDetail, customerOptionLabel } from "@/domain/customers";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CampDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireCoach();
  const { id } = await params;
  const { edit } = await searchParams;
  const camp = await db.camp.findUnique({
    where: { id },
    include: {
      coach: true,
      createdBy: true,
      members: { include: { customer: true } },
      classes: {
        orderBy: { startsAt: "asc" },
        include: {
          workouts: { orderBy: { order: "asc" }, include: { workout: { select: { id: true, name: true } } } },
          roster: true,
          createdBy: { select: { name: true } },
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
    redirect(flashUrl(`/camps/${id}`, "Camp updated"));
  }

  async function deleteCamp() {
    "use server";
    await db.camp.delete({ where: { id } });
    revalidatePath("/camps");
    redirect(flashUrl("/camps", "Camp deleted"));
  }

  async function addMember(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customerId"));
    if (customerId) await db.campMember.create({ data: { campId: id, customerId } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Member added"));
  }
  async function removeMember(formData: FormData) {
    "use server";
    const memberId = String(formData.get("memberId"));
    await db.campMember.delete({ where: { id: memberId } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Member removed"));
  }
  async function addClass(formData: FormData) {
    "use server";
    const u = await requireUser();
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
        createdById: u.id,
      },
    });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, `Class "${title}" added`));
  }
  async function deleteClass(formData: FormData) {
    "use server";
    await requireUser();
    const classId = String(formData.get("classId") ?? "");
    if (!classId) return;
    // Roster, assigned workouts and performances cascade via the schema.
    await db.class.delete({ where: { id: classId } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Class deleted"));
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
            {formatDate(camp.startDate)} → {formatDate(camp.endDate)} · Coach: {camp.coach?.name ?? "Unassigned"} · Created by {camp.createdBy?.name ?? "—"}
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
            <ConfirmSubmit
              message={`Delete camp "${camp.name}"? Its classes and memberships will be removed. This cannot be undone.`}
              className="text-xs text-muted hover:text-red-600"
            >
              Delete this camp
            </ConfirmSubmit>
          </form>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Members, then the add-class form */}
        <div className="lg:col-span-1 space-y-6">
          <section>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Members ({camp.members.length})</h2>
            <div className="bg-card border border-border rounded-xl p-3">
              {camp.members.length === 0 ? (
                <div className="text-xs text-muted px-1 py-2">No members yet.</div>
              ) : (
                <ul className="divide-y divide-border mb-2 max-h-80 overflow-auto">
                  {camp.members.map((m) => {
                    const detail = customerDetail(m.customer);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-1 py-1.5 group">
                        <Link href={`/customers/${m.customerId}`} className="min-w-0 hover:text-accent">
                          <div className="text-sm font-medium truncate">{m.customer.name}</div>
                          {detail && <div className="text-[11px] text-muted truncate">{detail}</div>}
                        </Link>
                        <form action={removeMember} className="shrink-0">
                          <input type="hidden" name="memberId" value={m.id} />
                          <ConfirmSubmit message={`Remove ${m.customer.name} from this camp?`} className="text-muted hover:text-red-600 text-base leading-none px-1 opacity-0 group-hover:opacity-100" >×</ConfirmSubmit>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
              <form action={addMember} className="flex gap-2 pt-1">
                <select name="customerId" className="flex-1 min-w-0 rounded-lg border border-border px-2 py-1.5 text-sm">
                  <option value="">+ Add member…</option>
                  {allCustomers.filter((c) => !memberIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{customerOptionLabel(c)}</option>)}
                </select>
                <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm shrink-0">Add</button>
              </form>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Add a class</h2>
            <form action={addClass} className="bg-card border border-border rounded-xl p-4 space-y-2.5">
              <input name="title" required placeholder="Class title (e.g. Pro Team Strength)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-muted mb-1">Date</label>
                  <input name="date" type="date" required defaultValue={camp.startDate.toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Time</label>
                  <input name="time" type="time" defaultValue="07:00" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Capacity</label>
                  <input name="capacity" type="number" defaultValue={12} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Location</label>
                  <input name="location" placeholder="optional" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                  <input type="checkbox" name="dropInAllowed" className="rounded border-border" />
                  Allow drop-ins
                </label>
                <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">Add class</button>
              </div>
            </form>
          </section>
        </div>

        {/* Right column — the class list */}
        <section className="lg:col-span-2">
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
              location: c.location,
              workouts: c.workouts.map((cw) => ({ id: cw.workout.id, name: cw.workout.name })),
              rosterCount: c.roster.length,
              capacity: c.capacity,
              dropInAllowed: c.dropInAllowed,
              createdByName: c.createdBy?.name ?? null,
            }))}
            onDeleteClass={deleteClass}
          />
        </section>
      </div>
    </div>
  );
}
