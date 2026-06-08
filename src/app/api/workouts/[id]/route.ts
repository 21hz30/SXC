import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { saveWorkout, deleteWorkout } from "@/domain/workouts";
import type { WorkoutItemInput } from "@/domain/exercises";

// PUT = atomic batch save (meta + tags + ordered items)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const body = (await req.json()) as {
    name: string;
    description?: string | null;
    type?: string | null;
    tags?: string | null;
    items: WorkoutItemInput[];
  };
  await saveWorkout({ user }, id, {
    name: body.name,
    description: body.description ?? null,
    type: body.type ?? null,
    tags: body.tags ?? null,
    items: body.items ?? [],
  });
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await deleteWorkout({ user }, id);
  return Response.json({ ok: true });
}
