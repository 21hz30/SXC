import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Plus, Dumbbell } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { categoryLabel } from "@/domain/exercises";
import { cloneWorkout } from "@/domain/workouts";
import { WORKOUT_TYPES, workoutTypeMeta } from "@/lib/workoutTypes";
import { getMyCustomerId, requireUser } from "@/lib/auth";
import { workoutScope } from "@/lib/access";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<{ new?: string; type?: string; creator?: string; tag?: string }> }) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const { new: isNew, type: typeFilter, creator: creatorParam, tag: tagParam } = await searchParams;
  const creatorFilter = creatorParam || null;
  const tagFilter = tagParam || null;

  // Staff see their tenant's shared library (admin = every tenant's). A customer
  // sees ONLY workouts they built for themselves — the coach library is not
  // shared with athletes.
  const myCustomerId = isStaff ? null : await getMyCustomerId();
  const where = isStaff ? workoutScope(user) : { ownerCustomerId: myCustomerId };

  const workouts = await db.workout.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { order: "asc" }, take: 6 },
      classes: { include: { class: { select: { startsAt: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // Faceted filters: Type (tabs) · Created-by (staff library) · Tag. Each
  // dimension's options/counts are computed within the OTHER active filters, and
  // the list is filtered by all three together.
  type Row = (typeof workouts)[number];
  const mType = (w: Row) => !typeFilter || w.type === typeFilter;
  const mCreator = (w: Row) => !creatorFilter || w.createdByUserId === creatorFilter;
  const mTag = (w: Row) => !tagFilter || splitTags(w.tags).includes(tagFilter);

  const typeCounts = WORKOUT_TYPES.map((t) => ({
    ...t,
    count: workouts.filter((w) => mCreator(w) && mTag(w) && w.type === t.key).length,
  }));
  const allTypeCount = workouts.filter((w) => mCreator(w) && mTag(w)).length;

  // Distinct authors (stable list), each counted within the active Type+Tag.
  // Athlete-private workouts have no author, so this is a staff-library concept.
  const creatorMap = new Map<string, { id: string; name: string; count: number }>();
  if (isStaff) {
    for (const w of workouts) {
      if (w.createdByUserId && w.createdBy && !creatorMap.has(w.createdByUserId)) {
        creatorMap.set(w.createdByUserId, { id: w.createdByUserId, name: w.createdBy.name, count: 0 });
      }
    }
    for (const w of workouts) {
      if (w.createdByUserId && mType(w) && mTag(w)) {
        const e = creatorMap.get(w.createdByUserId);
        if (e) e.count++;
      }
    }
  }
  const creators = [...creatorMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Distinct tags (stable list), each counted within the active Type+Creator.
  const tagMap = new Map<string, number>();
  for (const w of workouts) for (const t of splitTags(w.tags)) if (!tagMap.has(t)) tagMap.set(t, 0);
  for (const w of workouts) if (mType(w) && mCreator(w)) for (const t of splitTags(w.tags)) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
  const tagOptions = [...tagMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));

  const shown = workouts.filter((w) => mType(w) && mCreator(w) && mTag(w));
  const anyFilter = !!typeFilter || !!creatorFilter || !!tagFilter;
  const cur = { type: typeFilter, creator: creatorFilter ?? undefined, tag: tagFilter ?? undefined };

  // Customers also see the workouts their coach assigned them (distinct, recent
  // first) so they can review or copy one into their own library to practice.
  const assigned = !isStaff && myCustomerId
    ? await db.workoutAssignment.findMany({
        where: { customerId: myCustomerId },
        orderBy: { scheduledDate: "desc" },
        distinct: ["workoutId"],
        take: 24,
        include: { workout: { include: { _count: { select: { items: true } } } }, camp: { select: { name: true } } },
      })
    : [];
  // Which assigned workouts the customer has already copied (match by name) — so
  // we can show "Added" instead of letting them pile up duplicates.
  const myWorkoutNames = new Set(workouts.map((w) => w.name));

  async function createWorkout(formData: FormData) {
    "use server";
    const u = await requireUser();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) redirect("/workouts");
    // Staff create shared (library) workouts; a customer creates a private one
    // owned by themselves.
    let ownerCustomerId: string | null = null;
    if (u.role === "customer") {
      ownerCustomerId = await getMyCustomerId();
      if (!ownerCustomerId) redirect("/profile");
    }
    const w = await db.workout.create({
      data: {
        name,
        description: String(formData.get("description") ?? "").trim() || null,
        type: String(formData.get("type") ?? "").trim() || null,
        ownerCustomerId,
        // Staff workouts join their tenant's shared library (visible to other
        // coaches in the same tenant); athlete-private workouts stay untenanted.
        ...(ownerCustomerId ? {} : { tenantId: u.tenantId, createdByUserId: u.id, visibility: "team" }),
      },
    });
    revalidatePath("/workouts");
    redirect(`/workouts/${w.id}`);
  }

  // Clone a workout (with its exercises) and open the copy to tweak — handy for
  // making a "pro" variant of an "open" workout (more rounds, less rest).
  async function duplicateWorkout(formData: FormData) {
    "use server";
    const u = await requireUser();
    const workoutId = String(formData.get("workoutId") ?? "");
    if (!workoutId) redirect("/workouts");
    const w = await db.workout.findUnique({ where: { id: workoutId }, select: { ownerCustomerId: true, tenantId: true } });
    const staff = u.role === "admin" || u.role === "coach";
    const mine = staff ? null : await getMyCustomerId();
    // Staff duplicate a library workout (a coach only within their own tenant;
    // an admin across any). A customer duplicates only their own private one.
    const ok = w && (
      staff
        ? w.ownerCustomerId === null && (u.role === "admin" || w.tenantId === u.tenantId)
        : w.ownerCustomerId === mine
    );
    if (!ok) redirect("/workouts");
    const copy = await cloneWorkout({ user: u }, workoutId);
    revalidatePath("/workouts");
    redirect(`/workouts/${copy.id}`);
  }

  // A customer copies a coach-assigned workout into their own library so they
  // can practice it on their own. Restricted to workouts actually assigned to them.
  async function addToMyWorkouts(formData: FormData) {
    "use server";
    const u = await requireUser();
    if (u.role === "admin" || u.role === "coach") redirect("/workouts");
    const mine = await getMyCustomerId();
    if (!mine) redirect("/profile");
    const workoutId = String(formData.get("workoutId") ?? "");
    const assignedToMe = await db.workoutAssignment.count({ where: { customerId: mine, workoutId } });
    if (!assignedToMe) redirect("/workouts");
    const orig = await db.workout.findUnique({ where: { id: workoutId }, include: { items: { orderBy: { order: "asc" } } } });
    if (!orig) redirect("/workouts");
    await db.workout.create({
      data: {
        name: orig.name,
        description: orig.description,
        type: orig.type,
        tags: orig.tags,
        ownerCustomerId: mine,
        items: {
          create: orig.items.map((it, i) => ({
            order: i, category: it.category, label: it.label, distanceM: it.distanceM, timeSec: it.timeSec,
            weightKg: it.weightKg, reps: it.reps, sets: it.sets, paceSecPerKm: it.paceSecPerKm, heightM: it.heightM,
            notes: it.notes, tag: it.tag,
          })),
        },
      },
    });
    revalidatePath("/workouts");
    redirect(flashUrl("/workouts", `“${orig.name}” added to your workouts`));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Workouts</h1>
          <div className="text-sm text-muted mt-1">
            {isStaff ? `${workouts.length} templates` : "Your coach's plan, plus workouts you save to practice"}
          </div>
        </div>
        {/* Compact icon button on phones; full label from sm up. */}
        <Link
          href="/workouts?new=1"
          aria-label="New workout"
          title="New workout"
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-white text-sm font-medium hover:opacity-90 h-9 w-9 sm:w-auto sm:px-4"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New workout</span>
        </Link>
      </header>

      {isNew && (
        <form action={createWorkout} className="bg-card border border-border rounded-xl p-6 mb-6 space-y-4">
          <div><label className="block text-sm font-medium mb-1.5">Name</label><input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Description</label><input name="description" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Type</label>
            <select name="type" defaultValue={typeFilter && WORKOUT_TYPES.some((t) => t.key === typeFilter) ? typeFilter : ""} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <option value="">Uncategorized</option>
              {WORKOUT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="text-xs text-muted">You&apos;ll add exercises on the next screen.{isStaff ? " Assign it to classes from the camp page." : " It's private to you — use it to track your own training."}</div>
          <div className="flex justify-end gap-2">
            <Link href="/workouts" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Create &amp; edit</button>
          </div>
        </form>
      )}

      {/* Customer: the workouts a coach assigned — review, or save a copy to practice */}
      {!isStaff && assigned.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5"><Dumbbell size={13} /> Assigned by your coach</h2>
          <div className="space-y-3">
            {assigned.map((a) => {
              const meta = workoutTypeMeta(a.workout.type);
              const added = myWorkoutNames.has(a.workout.name);
              return (
                <div key={a.id} className="bg-card border border-border rounded-xl p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/workouts/${a.workout.id}`} className="font-semibold hover:text-accent truncate">{a.workout.name}</Link>
                        {meta && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {a.workout._count.items} exercise{a.workout._count.items === 1 ? "" : "s"}
                        {a.camp?.name ? ` · ${a.camp.name}` : ""}
                        {a.scheduledDate ? ` · ${formatDate(a.scheduledDate)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/workouts/${a.workout.id}`} className="text-xs rounded-lg border border-border px-2.5 py-1.5 text-muted hover:text-accent hover:border-accent">View</Link>
                      {added ? (
                        <span className="text-xs rounded-lg px-2.5 py-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200">Saved</span>
                      ) : (
                        <form action={addToMyWorkouts}>
                          <input type="hidden" name="workoutId" value={a.workout.id} />
                          <button type="submit" className="text-xs rounded-lg bg-foreground text-white px-2.5 py-1.5 hover:opacity-90 inline-flex items-center gap-1"><Plus size={13} /> Practice</button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!isStaff && <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">My workouts</h2>}

      {/* Filters — Type (tabs) · Created by (staff library) · Tag. Each chip
          preserves the other active filters; counts are faceted. Wraps on H5. */}
      <div className="space-y-2.5 mb-4">
        <div className="flex flex-wrap gap-2">
          <Link href={filtersUrl(cur, { type: undefined })} className={chipCls(!typeFilter)}>All <span className="tabular-nums opacity-70">{allTypeCount}</span></Link>
          {typeCounts.map((t) => (
            <Link key={t.key} href={filtersUrl(cur, { type: t.key })} className={chipCls(typeFilter === t.key)}>
              {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
            </Link>
          ))}
        </div>

        {isStaff && creators.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted mr-0.5">Created by</span>
            <Link href={filtersUrl(cur, { creator: undefined })} className={chipCls(!creatorFilter)}>All</Link>
            {creators.map((c) => (
              <Link key={c.id} href={filtersUrl(cur, { creator: c.id })} className={chipCls(creatorFilter === c.id)}>
                <span data-no-i18n>{c.name}</span> <span className="tabular-nums opacity-70">{c.count}</span>
              </Link>
            ))}
          </div>
        )}

        {tagOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted mr-0.5">Tag</span>
            <Link href={filtersUrl(cur, { tag: undefined })} className={chipCls(!tagFilter)}>All</Link>
            {tagOptions.map((t) => (
              <Link key={t.name} href={filtersUrl(cur, { tag: t.name })} className={chipCls(tagFilter === t.name)}>
                <span data-no-i18n>{t.name}</span> <span className="tabular-nums opacity-70">{t.count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {shown.map((w) => {
          const lastUsed = w.classes
            .map((cw) => cw.class.startsAt)
            .sort((a, b) => b.getTime() - a.getTime())[0];
          const itemSummary = w.items.map((i) => categoryLabel(i.category)).slice(0, 6).join(" · ");
          return (
            <div key={w.id} className="block bg-card border border-border rounded-xl p-5 hover:border-accent transition">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/workouts/${w.id}`} className="text-lg font-semibold hover:text-accent">{w.name}</Link>
                    {workoutTypeMeta(w.type) && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${workoutTypeMeta(w.type)!.badge}`}>{workoutTypeMeta(w.type)!.label}</span>}
                  </div>
                  {w.description && <div className="text-sm text-muted mt-0.5">{w.description}</div>}
                </div>
                <div className="flex items-start gap-3 shrink-0">
                  <div className="text-right text-xs text-muted">
                    <div>{w.items.length} exercises</div>
                    <div>{w.classes.length} classes</div>
                    <div>{lastUsed ? `last: ${formatDate(lastUsed)}` : "never used"}</div>
                  </div>
                  <form action={duplicateWorkout}>
                    <input type="hidden" name="workoutId" value={w.id} />
                    <button type="submit" className="text-xs rounded-lg border border-border px-2.5 py-1 text-muted hover:text-accent hover:border-accent">Duplicate</button>
                  </form>
                </div>
              </div>
              {itemSummary && (
                <Link href={`/workouts/${w.id}`} className="block text-xs text-muted mt-3 truncate hover:text-accent">
                  {itemSummary}{w.items.length > 6 ? " …" : ""}
                </Link>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {splitTags(w.tags).map((t) => (
                  <span key={t} className="text-xs bg-accent/10 text-accent rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="text-center text-sm text-muted py-10 bg-card border border-border border-dashed rounded-xl">
            {anyFilter ? "No workouts match these filters." : "No workouts yet — tap “New workout” to start."}
          </div>
        )}
      </div>
    </div>
  );
}

/** "pro team, strength" → ["pro team", "strength"]; empty/blank → []. */
function splitTags(tags: string | null | undefined): string[] {
  return (tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

/** Filter-chip styling — solid when active, outline + hover otherwise. */
function chipCls(active: boolean): string {
  return `text-xs rounded-full px-3 py-1.5 border transition ${
    active ? "bg-foreground text-white border-foreground" : "border-border text-muted hover:border-accent"
  }`;
}

/** Build /workouts?… keeping the current filters but overriding the patched
 *  dimension(s). Pass `undefined` for a dimension to clear it ("All"). */
function filtersUrl(
  cur: { type?: string; creator?: string; tag?: string },
  patch: { type?: string; creator?: string; tag?: string },
): string {
  const m = { ...cur, ...patch };
  const qs = new URLSearchParams();
  if (m.type) qs.set("type", m.type);
  if (m.creator) qs.set("creator", m.creator);
  if (m.tag) qs.set("tag", m.tag);
  const s = qs.toString();
  return s ? `/workouts?${s}` : "/workouts";
}
