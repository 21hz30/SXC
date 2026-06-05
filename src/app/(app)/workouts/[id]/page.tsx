import { notFound } from "next/navigation";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { getWorkout } from "@/domain/workouts";
import BackButton from "@/components/BackButton";
import WorkoutEditor, { type Item } from "@/components/WorkoutEditor";

export const dynamic = "force-dynamic";

export default async function WorkoutDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const w = await getWorkout({ user }, id);
  if (!w) notFound();
  // Staff see shared-library workouts; a customer only their own private ones.
  const isStaff = user.role === "admin" || user.role === "coach";
  if (isStaff ? w.ownerCustomerId !== null : w.ownerCustomerId !== (await getMyCustomerId())) notFound();

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
        initialTags={w.tags}
        initialItems={w.items as Item[]}
      />
    </div>
  );
}
