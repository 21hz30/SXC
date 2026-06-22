import { notFound } from "next/navigation";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWorkout, listWorkoutTags } from "@/domain/workouts";
import BackButton from "@/components/BackButton";
import WorkoutEditor, { type Item } from "@/components/WorkoutEditor";
import ExerciseList from "@/components/ExerciseList";

export const dynamic = "force-dynamic";

export default async function WorkoutDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const w = await getWorkout({ user }, id);
  if (!w) notFound();

  const isStaff = user.role === "admin" || user.role === "coach";
  const myCustomerId = await getMyCustomerId();
  // Staff may edit shared-library workouts — but a coach only within their own
  // tenant (admins across any); a customer may edit only their own private one.
  const canEdit = isStaff
    ? w.ownerCustomerId === null && (user.role === "admin" || w.tenantId === user.tenantId)
    : w.ownerCustomerId === myCustomerId;
  // An athlete can still VIEW (read-only) any workout that's on their plan — e.g.
  // a camp workout they tapped from the calendar — even though they can't edit it.
  const canView =
    canEdit ||
    (!!myCustomerId &&
      (await db.workoutAssignment.count({ where: { customerId: myCustomerId, workoutId: id } })) > 0);
  if (!canView) notFound();

  if (canEdit) {
    const allTags = await listWorkoutTags();
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <BackButton fallback="/workouts" label="Back" />
        <header className="mt-3 mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{w.name}</h1>
          {w.description && <div className="text-sm text-muted mt-1">{w.description}</div>}
        </header>
        <WorkoutEditor
          workoutId={w.id}
          initialName={w.name}
          initialDescription={w.description}
          initialType={w.type}
          initialTags={w.tags}
          initialItems={w.items as Item[]}
          allTags={allTags}
        />
      </div>
    );
  }

  // Read-only view for an athlete looking at a workout that's on their plan.
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <BackButton fallback="/calendar" label="Back" />
      <header className="mt-3 mb-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{w.name}</h1>
        {w.description && <div className="text-sm text-muted mt-1">{w.description}</div>}
      </header>
      {w.items.length > 0 ? (
        <ExerciseList items={w.items} />
      ) : (
        <div className="mt-4 bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
          No exercises listed for this workout yet.
        </div>
      )}
    </div>
  );
}
