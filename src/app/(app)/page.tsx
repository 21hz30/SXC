import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatTime, formatDate, startOfDay, endOfDay, addDays, formatDateLong } from "@/lib/utils";
import { Calendar, Users, Dumbbell, Tent } from "lucide-react";
import TodoList from "@/components/TodoList";
import { listTodos } from "@/domain/todos";
import { classScope, customerScope, campScope } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const now = new Date();
  const [todayClasses, upcomingClasses, customerCount, campCount, workoutCount, recentActivity, todos] = await Promise.all([
    db.class.findMany({
      where: { startsAt: { gte: startOfDay(), lte: endOfDay() }, ...classScope(user) },
      orderBy: { startsAt: "asc" },
      include: { roster: true, workouts: { include: { workout: { select: { name: true } } } }, camp: true },
    }),
    db.class.findMany({
      where: { startsAt: { gt: endOfDay(), lte: endOfDay(addDays(now, 7)) }, ...classScope(user) },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: { camp: true, roster: true },
    }),
    db.customer.count({ where: customerScope(user) }),
    db.camp.count({ where: campScope(user) }),
    db.workout.count(),
    db.activityData.findMany({ where: { customer: customerScope(user) }, orderBy: { date: "desc" }, take: 5, include: { customer: true } }),
    listTodos({ user }),
  ]);

  const todoItems = todos;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="text-sm text-muted">{formatDateLong(now)}</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Welcome back, {user.name.split(" ")[0]}</h1>
      </header>

      <div className={`grid grid-cols-2 ${isStaff ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4 mb-8`}>
        <Stat icon={Calendar} label="Classes today" value={todayClasses.length} href="/calendar" />
        <Stat icon={Tent} label={isStaff ? "Active camps" : "My camps"} value={campCount} href="/camps" />
        {isStaff && <Stat icon={Users} label="Customers" value={customerCount} href="/customers" />}
        <Stat icon={Dumbbell} label="Workouts" value={workoutCount} href="/workouts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 space-y-6">
          <TodoList todos={todoItems} />

          <div>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Today&apos;s classes</h2>
            {todayClasses.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-muted text-sm">No classes scheduled today.</div>
            ) : (
              <ul className="space-y-3">
                {todayClasses.map((c) => {
                  const attended = c.roster.filter((r) => r.attendance === "attended").length;
                  return (
                    <li key={c.id}>
                      <Link href={`/classes/${c.id}`} className="block bg-card border border-border rounded-xl p-5 hover:border-accent transition">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-lg font-semibold">{c.title}</div>
                            <div className="text-sm text-muted mt-0.5">{formatTime(c.startsAt)} · {c.camp?.name ?? "—"} · {c.workouts.length === 0 ? "No workout" : c.workouts.map((cw) => cw.workout.name).join(" + ")}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-semibold tabular-nums">{c.roster.length}<span className="text-base text-muted font-normal"> / {c.capacity}</span></div>
                            <div className="text-xs text-muted mt-0.5">{attended} attended</div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Upcoming this week</h2>
            {upcomingClasses.length === 0 ? (
              <div className="text-sm text-muted">Nothing else this week.</div>
            ) : (
              <ul className="bg-card border border-border rounded-xl divide-y divide-border">
                {upcomingClasses.map((c) => (
                  <li key={c.id}>
                    <Link href={`/classes/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-background">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{c.title}</div>
                        <div className="text-xs text-muted">{formatDate(c.startsAt)} · {formatTime(c.startsAt)}</div>
                      </div>
                      <div className="text-xs text-muted tabular-nums shrink-0 ml-2">{c.roster.length}/{c.capacity}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Recent activity</h2>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {recentActivity.map((a) => (
                <Link key={a.id} href={`/customers/${a.customerId}`} className="flex items-center justify-between px-4 py-3 hover:bg-background">
                  <div>
                    <div className="font-medium text-sm">{a.customer.name}</div>
                    <div className="text-xs text-muted capitalize">{a.activityType} · {formatDate(a.date)}</div>
                  </div>
                  <div className="text-xs text-muted tabular-nums">{a.avgHr ?? "—"} bpm</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, href }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="bg-card border border-border rounded-xl p-5 hover:border-accent transition block">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
        <Icon size={16} className="text-muted" />
      </div>
      <div className="text-3xl font-semibold mt-2 tabular-nums">{value}</div>
    </Link>
  );
}
