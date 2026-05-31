import Link from "next/link";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { startOfDay, endOfDay, startOfWeek, startOfMonth, addDays, addMonths, formatTime, sameDay } from "@/lib/utils";
import { classScope } from "@/lib/access";
import { ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";

export const dynamic = "force-dynamic";

type View = "day" | "week" | "month";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: View; d?: string }>;
}) {
  const user = await requireCoach();
  const sp = await searchParams;
  const view: View = sp.view ?? "week";
  const cursor = sp.d ? new Date(sp.d) : new Date();

  let rangeStart: Date, rangeEnd: Date, prev: Date, next: Date, title: string;
  if (view === "day") {
    rangeStart = startOfDay(cursor); rangeEnd = endOfDay(cursor);
    prev = addDays(cursor, -1); next = addDays(cursor, 1);
    title = cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } else if (view === "week") {
    rangeStart = startOfWeek(cursor); rangeEnd = endOfDay(addDays(rangeStart, 6));
    prev = addDays(cursor, -7); next = addDays(cursor, 7);
    title = `Week of ${rangeStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
  } else {
    rangeStart = startOfMonth(cursor);
    rangeEnd = endOfDay(addDays(addMonths(rangeStart, 1), -1));
    prev = addMonths(cursor, -1); next = addMonths(cursor, 1);
    title = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  // For month view, expand range to grid boundaries so we still load relevant items
  const queryStart = view === "month" ? startOfWeek(rangeStart) : rangeStart;
  const queryEnd = view === "month" ? endOfDay(addDays(queryStart, 41)) : rangeEnd;

  const [classes, todos] = await Promise.all([
    db.class.findMany({
      where: { startsAt: { gte: queryStart, lte: queryEnd }, ...classScope(user) },
      orderBy: { startsAt: "asc" },
      include: { roster: true, camp: true },
    }),
    db.todo.findMany({
      where: { ownerId: user.id, dueDate: { gte: queryStart, lte: queryEnd } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const isoDay = (d: Date) => d.toISOString().split("T")[0];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <div className="text-base text-muted">{title}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?view=${view}&d=${isoDay(prev)}`} className="p-2 rounded-lg border border-border hover:bg-background"><ChevronLeft size={16} /></Link>
          <Link href={`/calendar?view=${view}`} className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-background">Today</Link>
          <Link href={`/calendar?view=${view}&d=${isoDay(next)}`} className="p-2 rounded-lg border border-border hover:bg-background"><ChevronRight size={16} /></Link>
          <div className="ml-3 flex rounded-lg border border-border overflow-hidden">
            {(["day", "week", "month"] as View[]).map((v) => (
              <Link key={v} href={`/calendar?view=${v}&d=${isoDay(cursor)}`} className={`px-3 py-2 text-sm capitalize ${view === v ? "bg-foreground text-white" : "hover:bg-background"}`}>{v}</Link>
            ))}
          </div>
        </div>
      </header>

      {view === "day" && <DayView classes={classes} todos={todos} cursor={cursor} />}
      {view === "week" && <WeekView classes={classes} todos={todos} weekStart={rangeStart} />}
      {view === "month" && <MonthView classes={classes} todos={todos} monthStart={rangeStart} />}
    </div>
  );
}

type ClassWithRel = Awaited<ReturnType<typeof db.class.findMany>>[number] & { roster: { attendance: string }[]; camp: { name: string } | null };
type TodoRow = Awaited<ReturnType<typeof db.todo.findMany>>[number];

function ClassCard({ c }: { c: ClassWithRel }) {
  const attended = c.roster.filter((r) => r.attendance === "attended").length;
  return (
    <Link href={`/classes/${c.id}`} className="block bg-card border border-border rounded-lg p-3 hover:border-accent transition">
      <div className="text-xs font-semibold text-accent">{formatTime(c.startsAt)}</div>
      <div className="text-sm font-medium leading-tight mt-0.5">{c.title}</div>
      <div className="text-xs text-muted mt-1">{c.camp?.name ?? "—"} · {c.roster.length}/{c.capacity}{attended > 0 && ` · ${attended} ✓`}</div>
    </Link>
  );
}

function TodoCard({ t }: { t: TodoRow }) {
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${t.done ? "bg-background border-border opacity-60" : "bg-amber-50 border-amber-200"}`}>
      <CheckSquare size={14} className={`mt-0.5 shrink-0 ${t.done ? "text-emerald-500" : "text-amber-600"}`} />
      <div className={`text-xs leading-snug ${t.done ? "line-through text-muted" : "text-foreground font-medium"}`}>{t.title}</div>
    </div>
  );
}

function DayView({ classes, todos, cursor }: { classes: ClassWithRel[]; todos: TodoRow[]; cursor: Date }) {
  const dayTodos = todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), cursor));
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  return (
    <div className="grid grid-cols-4 gap-6">
      <div className="col-span-3 bg-card border border-border rounded-xl divide-y divide-border">
        {hours.map((h) => {
          const inHour = classes.filter((c) => sameDay(new Date(c.startsAt), cursor) && new Date(c.startsAt).getHours() === h);
          return (
            <div key={h} className="flex">
              <div className="w-20 px-4 py-4 text-xs text-muted">{h}:00</div>
              <div className="flex-1 p-2 space-y-2 min-h-[60px]">
                {inHour.map((c) => <ClassCard key={c.id} c={c} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <h3 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Todos due today</h3>
        <div className="space-y-2">
          {dayTodos.length === 0 ? <div className="text-xs text-muted">Nothing due.</div> : dayTodos.map((t) => <TodoCard key={t.id} t={t} />)}
        </div>
      </div>
    </div>
  );
}

function WeekView({ classes, todos, weekStart }: { classes: ClassWithRel[]; todos: TodoRow[]; weekStart: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  return (
    <div className="grid grid-cols-7 gap-3">
      {days.map((d) => {
        const isToday = sameDay(d, today);
        const inDay = classes.filter((c) => sameDay(new Date(c.startsAt), d));
        const dayTodos = todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), d));
        return (
          <div key={d.toISOString()} className="min-h-[400px]">
            <div className={`text-xs font-medium uppercase tracking-wide mb-2 ${isToday ? "text-accent" : "text-muted"}`}>
              {d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
            </div>
            <div className="space-y-2">
              {dayTodos.map((t) => <TodoCard key={t.id} t={t} />)}
              {inDay.map((c) => <ClassCard key={c.id} c={c} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ classes, todos, monthStart }: { classes: ClassWithRel[]; todos: TodoRow[]; monthStart: Date }) {
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  const month = monthStart.getMonth();
  return (
    <div>
      <div className="grid grid-cols-7 gap-px bg-border border border-border rounded-xl overflow-hidden">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-background px-3 py-2 text-xs font-medium text-muted uppercase tracking-wide">{d}</div>
        ))}
        {days.map((d) => {
          const inDay = classes.filter((c) => sameDay(new Date(c.startsAt), d));
          const dayTodos = todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), d));
          const isCurMonth = d.getMonth() === month;
          const isToday = sameDay(d, today);
          return (
            <div key={d.toISOString()} className={`bg-card min-h-[110px] p-2 ${isCurMonth ? "" : "opacity-40"}`}>
              <div className={`text-xs font-medium mb-1 ${isToday ? "text-accent" : ""}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {dayTodos.slice(0, 2).map((t) => (
                  <div key={t.id} className={`text-[11px] rounded px-1.5 py-0.5 truncate flex items-center gap-1 ${t.done ? "bg-background text-muted line-through" : "bg-amber-100 text-amber-800"}`}>
                    <CheckSquare size={10} /> {t.title}
                  </div>
                ))}
                {inDay.slice(0, 2).map((c) => (
                  <Link key={c.id} href={`/classes/${c.id}`} className="block text-[11px] bg-background border border-border rounded px-1.5 py-1 hover:border-accent truncate">
                    <span className="text-accent font-semibold">{formatTime(c.startsAt)}</span> {c.title}
                  </Link>
                ))}
                {inDay.length + dayTodos.length > 4 && <div className="text-[10px] text-muted">+{inDay.length + dayTodos.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
