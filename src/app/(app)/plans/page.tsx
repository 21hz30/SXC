import { CalendarRange, Dumbbell, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { workoutScope } from "@/lib/access";
import { flashUrl } from "@/lib/flash";
import { formatDate, mondayOf } from "@/lib/utils";
import { assignWeeklyPlan, nextWeekStart } from "@/domain/weeklyPlans";
import WeeklyAssignmentBuilder, {
  type WeeklyPlanSubscriber,
  type WeeklyPlanWorkout,
} from "@/components/WeeklyAssignmentBuilder";

export const dynamic = "force-dynamic";

export default async function WeeklyPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  const defaultWeek = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") ? mondayOf(params.week!) : nextWeekStart();
  const recentStart = new Date();
  recentStart.setDate(recentStart.getDate() - 42);

  const [connections, workoutRows, recentAssignments] = await Promise.all([
    db.customerCoach.findMany({
      where: {
        status: "active",
        customer: { deletedAt: null },
        coach: { deletedAt: null },
        ...(user.role === "coach" ? { coachUserId: user.id } : {}),
      },
      select: {
        customer: { select: { id: true, name: true, phone: true, email: true, tags: true } },
        coach: { select: { name: true } },
      },
    }),
    db.workout.findMany({
      where: workoutScope(user),
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, tags: true },
    }),
    db.workoutAssignment.findMany({
      where: {
        assignedById: user.id,
        customer: { deletedAt: null },
        campId: null,
        scheduledDate: { gte: recentStart },
      },
      orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }],
      take: 240,
      select: {
        scheduledDate: true,
        status: true,
        customer: { select: { id: true, name: true } },
        workout: { select: { id: true, name: true } },
      },
    }),
  ]);

  const subscriberMap = new Map<string, WeeklyPlanSubscriber>();
  for (const connection of connections) {
    const existing = subscriberMap.get(connection.customer.id);
    if (existing) {
      if (!existing.coachNames.includes(connection.coach.name)) existing.coachNames.push(connection.coach.name);
      continue;
    }
    subscriberMap.set(connection.customer.id, {
      id: connection.customer.id,
      name: connection.customer.name,
      detail: connection.customer.phone ?? connection.customer.email ?? connection.customer.tags ?? null,
      coachNames: user.role === "admin" ? [connection.coach.name] : [],
    });
  }
  const subscribers = [...subscriberMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const workouts: WeeklyPlanWorkout[] = workoutRows;

  const deliveryMap = new Map<string, {
    date: Date;
    workoutName: string;
    recipients: Set<string>;
    completed: number;
  }>();
  for (const assignment of recentAssignments) {
    if (!assignment.scheduledDate) continue;
    const key = `${assignment.scheduledDate.toISOString().slice(0, 10)}|${assignment.workout.id}`;
    const delivery = deliveryMap.get(key) ?? {
      date: assignment.scheduledDate,
      workoutName: assignment.workout.name,
      recipients: new Set<string>(),
      completed: 0,
    };
    delivery.recipients.add(assignment.customer.id);
    if (assignment.status === "completed") delivery.completed += 1;
    deliveryMap.set(key, delivery);
  }
  const deliveries = [...deliveryMap.values()]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 16);

  async function assignPlan(formData: FormData) {
    "use server";
    const actor = await requireStaff();
    let input: unknown;
    try {
      input = JSON.parse(String(formData.get("plan") ?? "{}"));
    } catch {
      redirect(flashUrl("/plans", "Invalid weekly plan"));
    }
    const result = await assignWeeklyPlan(actor, input);
    if (!result.ok) redirect(flashUrl("/plans", result.message));

    revalidatePath("/plans");
    revalidatePath("/");
    revalidatePath("/calendar");
    revalidatePath("/customers");
    const summary = result.created > 0
      ? `${result.created} assignments created${result.skipped > 0 ? ` · ${result.skipped} already existed` : ""}`
      : `No new assignments · ${result.skipped} already existed`;
    redirect(flashUrl(`/plans?week=${result.weekStart}`, summary));
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/customers" className="mb-3 inline-block text-xs text-accent hover:underline">← Customers</Link>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-accent">
            <CalendarRange size={15} /> Coaching delivery
          </div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Weekly plans</h1>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <UsersRound size={16} /> <strong className="font-semibold text-foreground">{subscribers.length}</strong> active subscribers
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Dumbbell size={16} /> <strong className="font-semibold text-foreground">{workouts.length}</strong> workouts
          </span>
        </div>
      </header>

      <WeeklyAssignmentBuilder
        subscribers={subscribers}
        workouts={workouts}
        defaultWeek={defaultWeek}
        action={assignPlan}
      />

      <section className="mt-9" aria-labelledby="recent-deliveries-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="recent-deliveries-heading" className="text-sm font-semibold">Recent deliveries</h2>
          <span className="text-xs text-muted">Last 6 weeks</span>
        </div>
        {deliveries.length === 0 ? (
          <div className="border-y border-dashed border-border py-10 text-center text-sm text-muted">No direct plans assigned yet</div>
        ) : (
          <ul className="divide-y divide-border border-y border-border bg-card">
            {deliveries.map((delivery) => (
              <li key={`${delivery.date.toISOString()}-${delivery.workoutName}`} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" data-no-i18n>{delivery.workoutName}</div>
                  <div className="text-xs text-muted">{formatDate(delivery.date)}</div>
                </div>
                <div className="text-xs tabular-nums text-muted">
                  {delivery.completed}/{delivery.recipients.size} completed
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
