import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { startOfDay, endOfDay, startOfWeek, startOfMonth, addDays, addMonths, formatTime, sameDay } from "@/lib/utils";
import { classScope } from "@/lib/access";
import { ChevronLeft, ChevronRight, CheckSquare, StickyNote, Dumbbell } from "lucide-react";
import DayQuickAdd from "@/components/DayQuickAdd";
import ClassSignupButton from "@/components/ClassSignupButton";
import CalendarDnD from "@/components/CalendarDnD";

export const dynamic = "force-dynamic";

type View = "day" | "week" | "month";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: View; d?: string }>;
}) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
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

  // The signed-in athlete's own profile id — staff have one too (they can be
  // camp members), so this is fetched for everyone, not just customers.
  const myCustomerId = await getMyCustomerId();

  const [classes, todos, assignments] = await Promise.all([
    db.class.findMany({
      where: { startsAt: { gte: queryStart, lte: queryEnd }, ...classScope(user) },
      orderBy: { startsAt: "asc" },
      include: { roster: true, camp: true },
    }),
    db.todo.findMany({
      where: { ownerId: user.id, dueDate: { gte: queryStart, lte: queryEnd } },
      orderBy: { dueDate: "asc" },
    }),
    // The athlete's own assigned workouts (camp plans + self-assigned) land on
    // the calendar as all-day items.
    myCustomerId
      ? db.workoutAssignment.findMany({
          where: { customerId: myCustomerId, scheduledDate: { gte: queryStart, lte: queryEnd } },
          orderBy: { scheduledDate: "asc" },
          include: { workout: { select: { name: true } }, camp: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const isoDay = (d: Date) => d.toISOString().split("T")[0];

  // Customer self sign-up context: which of the shown classes they're on.
  const signedUpIds = new Set<string>(
    myCustomerId
      ? classes.filter((c) => c.roster.some((r) => r.customerId === myCustomerId)).map((c) => c.id)
      : [],
  );
  const canSignUp = !isStaff && !!myCustomerId;

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-baseline gap-2 sm:gap-3 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Calendar</h1>
          <div className="text-sm sm:text-base text-muted truncate">{title}</div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <Link href={`/calendar?view=${view}&d=${isoDay(prev)}`} className="p-2 rounded-lg border border-border hover:bg-background"><ChevronLeft size={16} /></Link>
          <Link href={`/calendar?view=${view}`} className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-background">Today</Link>
          <Link href={`/calendar?view=${view}&d=${isoDay(next)}`} className="p-2 rounded-lg border border-border hover:bg-background"><ChevronRight size={16} /></Link>
          <div className="ml-3 flex rounded-lg border border-border overflow-hidden">
            {(["day", "week", "month"] as View[]).map((v) => (
              <Link key={v} href={`/calendar?view=${v}&d=${isoDay(cursor)}`} className={`px-3 py-2 text-sm capitalize ${view === v ? "bg-foreground text-white" : "hover:bg-background"}`}>{v}</Link>
            ))}
          </div>
          {isStaff && (
            <div className="ml-2">
              <DayQuickAdd
                date={isoDay(view === "day" ? cursor : new Date())}
                returnTo={`/calendar?view=${view}&d=${isoDay(cursor)}`}
                variant="button"
                label="New"
                align="right"
              />
            </div>
          )}
        </div>
      </header>

      {view === "day" && <DayView classes={classes} todos={todos} assignments={assignments} cursor={cursor} canAdd={isStaff} canSignUp={canSignUp} signedUpIds={signedUpIds} />}
      {view === "week" && <WeekView classes={classes} todos={todos} assignments={assignments} weekStart={rangeStart} canAdd={isStaff} canSignUp={canSignUp} signedUpIds={signedUpIds} />}
      {view === "month" && <MonthView classes={classes} todos={todos} assignments={assignments} monthStart={rangeStart} canAdd={isStaff} />}
    </div>
  );
}

type ClassWithRel = Awaited<ReturnType<typeof db.class.findMany>>[number] & { roster: { attendance: string }[]; camp: { name: string } | null };
type TodoRow = Awaited<ReturnType<typeof db.todo.findMany>>[number];
type AssignmentRow = Awaited<ReturnType<typeof db.workoutAssignment.findMany>>[number] & { workout: { name: string }; camp: { name: string } | null };

const HOUR_PX = 52;
const HOUR_LINE = `repeating-linear-gradient(to bottom, var(--border) 0px, var(--border) 1px, transparent 1px, transparent ${HOUR_PX}px)`;

function hourLabel(h: number) {
  const hr = ((h + 11) % 12) + 1;
  return `${hr} ${h % 24 < 12 ? "AM" : "PM"}`;
}

// Greedy side-by-side column packing for overlapping events (Apple-calendar style).
function packColumns<T extends { startMin: number; endMin: number }>(
  items: T[],
): (T & { _col: number; _cols: number })[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: (T & { _col: number; _cols: number })[] = [];
  let group: (T & { _col: number })[] = [];
  let colEnds: number[] = [];
  const flush = () => {
    const cols = colEnds.length || 1;
    for (const g of group) out.push({ ...g, _cols: cols });
    group = [];
    colEnds = [];
  };
  for (const it of sorted) {
    if (colEnds.length && it.startMin >= Math.max(...colEnds)) flush();
    let col = colEnds.findIndex((e) => e <= it.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(it.endMin);
    } else {
      colEnds[col] = it.endMin;
    }
    group.push({ ...it, _col: col });
  }
  flush();
  return out;
}

// Visible hour window: default 7am–9pm, widened to fit any classes outside it.
function gridRange(classes: ClassWithRel[], days: Date[]) {
  let start = 7;
  let end = 21;
  for (const c of classes) {
    if (!days.some((d) => sameDay(new Date(c.startsAt), d))) continue;
    const s = new Date(c.startsAt);
    start = Math.min(start, s.getHours());
    end = Math.max(end, Math.ceil((s.getHours() * 60 + s.getMinutes() + c.durationMin) / 60));
  }
  start = Math.max(0, start);
  end = Math.min(24, Math.max(end, start + 1));
  return { startHour: start, endHour: end };
}

function TimeGutter({ startHour, endHour }: { startHour: number; endHour: number }) {
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  return (
    <div className="relative">
      {hours.map((h) => (
        <div
          key={h}
          className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-muted tabular-nums whitespace-nowrap"
          style={{ top: (h - startHour) * HOUR_PX }}
        >
          {hourLabel(h)}
        </div>
      ))}
    </div>
  );
}

function ClassBlock({
  c,
  startHour,
  col,
  cols,
  compact,
  canSignUp,
  signedUp,
  draggable = false,
}: {
  c: ClassWithRel;
  startHour: number;
  col: number;
  cols: number;
  compact: boolean;
  canSignUp: boolean;
  signedUp: boolean;
  draggable?: boolean;
}) {
  const s = new Date(c.startsAt);
  const startMin = s.getHours() * 60 + s.getMinutes();
  const top = ((startMin - startHour * 60) / 60) * HOUR_PX;
  const height = Math.max((c.durationMin / 60) * HOUR_PX, 20);
  const gap = 2;
  const left = `calc(${(col / cols) * 100}% + ${col === 0 ? 1 : gap}px)`;
  const width = `calc(${100 / cols}% - ${col === 0 ? 2 : gap + 1}px)`;
  const showSignup = !compact && canSignUp && height >= 64;
  const showMeta = height >= 46 && !showSignup;
  const attended = c.roster.filter((r) => r.attendance === "attended").length;
  const tone = signedUp
    ? "ring-emerald-400/60 bg-emerald-50 hover:bg-emerald-100/70"
    : "ring-accent/30 bg-accent/10 hover:bg-accent/20";
  return (
    <div className="absolute z-10" style={{ top, height, left, width }} draggable={draggable} data-drag-type="class" data-drag-id={c.id}>
      <div className={`relative h-full rounded-md ring-1 ${tone} shadow-sm overflow-hidden transition-colors ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${signedUp ? "bg-emerald-500" : "bg-accent"}`} />
        <Link href={`/classes/${c.id}`} draggable={false} className="absolute inset-0 z-0" aria-label={c.title} />
        <div className="relative z-10 pointer-events-none pl-2.5 pr-1.5 py-1">
          <div className={`text-[11px] font-semibold tabular-nums truncate ${signedUp ? "text-emerald-700" : "text-accent"}`}>
            {formatTime(c.startsAt)}
          </div>
          <div className="text-xs font-medium text-foreground truncate">{c.title}</div>
          {showMeta && (
            <div className="text-[10px] text-muted truncate mt-0.5">
              {c.camp?.name ?? "—"} · {c.roster.length}/{c.capacity}
              {attended > 0 && ` · ${attended} ✓`}
            </div>
          )}
        </div>
        {showSignup && (
          <div className="absolute left-2 right-1.5 bottom-1 z-20">
            <ClassSignupButton classId={c.id} signedUp={signedUp} isFull={c.roster.length >= c.capacity} size="xs" />
          </div>
        )}
        {compact && signedUp && (
          <span className="absolute right-1 top-1 z-20 text-[10px] font-bold leading-none text-emerald-600">✓</span>
        )}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  classes,
  startHour,
  endHour,
  now,
  compact,
  canSignUp,
  signedUpIds,
  enableDrag = false,
}: {
  day: Date;
  classes: ClassWithRel[];
  startHour: number;
  endHour: number;
  now: Date;
  compact: boolean;
  canSignUp: boolean;
  signedUpIds: Set<string>;
  enableDrag?: boolean;
}) {
  const total = (endHour - startHour) * HOUR_PX;
  const laid = packColumns(
    classes
      .filter((c) => sameDay(new Date(c.startsAt), day))
      .map((c) => {
        const s = new Date(c.startsAt);
        const sm = s.getHours() * 60 + s.getMinutes();
        return { c, startMin: sm, endMin: sm + c.durationMin };
      }),
  );
  const nowTop = ((now.getHours() * 60 + now.getMinutes() - startHour * 60) / 60) * HOUR_PX;
  const showNow = sameDay(day, now) && nowTop >= 0 && nowTop <= total;
  return (
    <div className="relative border-l border-border" style={{ backgroundImage: HOUR_LINE }} data-drop-day={day.toISOString().split("T")[0]} data-start-hour={startHour}>
      {laid.map((it) => (
        <ClassBlock
          key={it.c.id}
          c={it.c}
          startHour={startHour}
          col={it._col}
          cols={it._cols}
          compact={compact}
          canSignUp={canSignUp}
          signedUp={signedUpIds.has(it.c.id)}
          draggable={enableDrag}
        />
      ))}
      {showNow && (
        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
          <div className="relative h-px bg-accent">
            <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-accent" />
          </div>
        </div>
      )}
    </div>
  );
}

function TimeGrid({
  days,
  classes,
  startHour,
  endHour,
  now,
  compact,
  canSignUp,
  signedUpIds,
  enableDrag = false,
}: {
  days: Date[];
  classes: ClassWithRel[];
  startHour: number;
  endHour: number;
  now: Date;
  compact: boolean;
  canSignUp: boolean;
  signedUpIds: Set<string>;
  enableDrag?: boolean;
}) {
  return (
    <div className="overflow-y-auto" style={{ maxHeight: "68vh" }}>
      <div className="pt-3 pb-5">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))`,
            height: (endHour - startHour) * HOUR_PX,
          }}
        >
          <TimeGutter startHour={startHour} endHour={endHour} />
          {days.map((d) => (
            <DayColumn
              key={d.toISOString()}
              day={d}
              classes={classes}
              startHour={startHour}
              endHour={endHour}
              now={now}
              compact={compact}
              canSignUp={canSignUp}
              signedUpIds={signedUpIds}
              enableDrag={enableDrag}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TodoChip({ t }: { t: TodoRow }) {
  if (t.source === "note") {
    return (
      <div className="text-[10px] rounded px-1.5 py-0.5 truncate flex items-center gap-1 bg-sky-100 text-sky-800">
        <StickyNote size={10} /> {t.title}
      </div>
    );
  }
  return (
    <div
      className={`text-[10px] rounded px-1.5 py-0.5 truncate flex items-center gap-1 ${
        t.done ? "bg-background text-muted line-through" : "bg-amber-100 text-amber-800"
      }`}
    >
      <CheckSquare size={10} /> {t.title}
    </div>
  );
}

function TodoCard({ t }: { t: TodoRow }) {
  // Notes are todos with source="note": no done-state, sticky-note styling.
  if (t.source === "note") {
    return (
      <div className="flex items-start gap-2 p-2.5 rounded-lg border bg-sky-50 border-sky-200">
        <StickyNote size={14} className="mt-0.5 shrink-0 text-sky-600" />
        <div className="text-xs leading-snug text-foreground">{t.title}</div>
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${t.done ? "bg-background border-border opacity-60" : "bg-amber-50 border-amber-200"}`}>
      <CheckSquare size={14} className={`mt-0.5 shrink-0 ${t.done ? "text-emerald-500" : "text-amber-600"}`} />
      <div className={`text-xs leading-snug ${t.done ? "line-through text-muted" : "text-foreground font-medium"}`}>{t.title}</div>
    </div>
  );
}

function AssignmentChip({ a, draggable = false }: { a: AssignmentRow; draggable?: boolean }) {
  const done = a.status === "completed";
  return (
    <div
      draggable={draggable}
      data-drag-type="assignment"
      data-drag-id={a.id}
      className={`text-[10px] rounded px-1.5 py-0.5 truncate flex items-center gap-1 ${done ? "bg-background text-muted line-through" : "bg-violet-100 text-violet-800"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      title={a.camp ? `${a.workout.name} · ${a.camp.name}` : a.workout.name}
    >
      <Dumbbell size={10} className="shrink-0" /> {a.workout.name}
    </div>
  );
}

function AssignmentCard({ a }: { a: AssignmentRow }) {
  const done = a.status === "completed";
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${done ? "bg-background border-border opacity-60" : "bg-violet-50 border-violet-200"}`}>
      <Dumbbell size={14} className={`mt-0.5 shrink-0 ${done ? "text-emerald-500" : "text-violet-600"}`} />
      <div className="min-w-0">
        <div className={`text-xs leading-snug ${done ? "line-through text-muted" : "text-foreground font-medium"}`}>{a.workout.name}</div>
        {a.camp && <div className="text-[10px] text-muted truncate">{a.camp.name}</div>}
      </div>
    </div>
  );
}

function DayView({ classes, todos, assignments, cursor, canAdd, canSignUp, signedUpIds }: { classes: ClassWithRel[]; todos: TodoRow[]; assignments: AssignmentRow[]; cursor: Date; canAdd: boolean; canSignUp: boolean; signedUpIds: Set<string> }) {
  const now = new Date();
  const { startHour, endHour } = gridRange(classes, [cursor]);
  const dayTodos = todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), cursor));
  const dayAssignments = assignments.filter((a) => a.scheduledDate && sameDay(new Date(a.scheduledDate), cursor));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6">
      <div className="lg:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
        <TimeGrid days={[cursor]} classes={classes} startHour={startHour} endHour={endHour} now={now} compact={false} canSignUp={canSignUp} signedUpIds={signedUpIds} />
      </div>
      <div className="space-y-5">
        {dayAssignments.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Training</h3>
            <div className="space-y-2">
              {dayAssignments.map((a) => <AssignmentCard key={a.id} a={a} />)}
            </div>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-muted uppercase tracking-wide">To-dos &amp; notes</h3>
            {canAdd && (
              <DayQuickAdd
                date={cursor.toISOString().split("T")[0]}
                returnTo={`/calendar?view=day&d=${cursor.toISOString().split("T")[0]}`}
                variant="text"
                label="Add"
              />
            )}
          </div>
          <div className="space-y-2">
            {dayTodos.length === 0 ? <div className="text-xs text-muted">Nothing for this day.</div> : dayTodos.map((t) => <TodoCard key={t.id} t={t} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekView({ classes, todos, assignments, weekStart, canAdd, canSignUp, signedUpIds }: { classes: ClassWithRel[]; todos: TodoRow[]; assignments: AssignmentRow[]; weekStart: Date; canAdd: boolean; canSignUp: boolean; signedUpIds: Set<string> }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const now = new Date();
  const { startHour, endHour } = gridRange(classes, days);
  const isoDay = (d: Date) => d.toISOString().split("T")[0];
  const returnTo = `/calendar?view=week&d=${isoDay(weekStart)}`;
  const cols = `3.5rem repeat(7, minmax(0,1fr))`;
  const dayTodos = days.map((d) => todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), d)));
  const dayAssignments = days.map((d) => assignments.filter((a) => a.scheduledDate && sameDay(new Date(a.scheduledDate), d)));
  const hasAllDay = dayTodos.some((a) => a.length > 0) || dayAssignments.some((a) => a.length > 0);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* On phones the 7-day grid would be unreadable, so it scrolls horizontally
          at a usable min width; from sm+ it fits normally. */}
      <div className="overflow-x-auto">
      <div className="min-w-[600px] sm:min-w-0">
      <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
        <div className="border-r border-border" />
        {days.map((d) => {
          const isToday = sameDay(d, now);
          return (
            <div key={d.toISOString()} className="group border-r border-border last:border-r-0 px-2 py-2 text-center">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
              <div className="mt-1 flex items-center justify-center gap-1">
                <span className={`inline-flex items-center justify-center text-sm font-semibold ${isToday ? "h-7 w-7 rounded-full bg-accent text-white" : "text-foreground"}`}>{d.getDate()}</span>
                {canAdd && (
                  <span className="opacity-0 group-hover:opacity-100 transition">
                    <DayQuickAdd date={isoDay(d)} returnTo={returnTo} variant="icon" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hasAllDay && (
        <div className="grid border-b border-border bg-background/40" style={{ gridTemplateColumns: cols }}>
          <div className="border-r border-border pr-2 pt-1.5 text-right text-[9px] font-medium uppercase tracking-wide text-muted">All-day</div>
          {days.map((d, i) => (
            <div key={d.toISOString()} data-drop-day={isoDay(d)} className="border-r border-border last:border-r-0 p-1 space-y-1 min-h-[1.75rem]">
              {dayAssignments[i].map((a) => <AssignmentChip key={a.id} a={a} draggable />)}
              {dayTodos[i].map((t) => <TodoChip key={t.id} t={t} />)}
            </div>
          ))}
        </div>
      )}
      <TimeGrid days={days} classes={classes} startHour={startHour} endHour={endHour} now={now} compact canSignUp={canSignUp} signedUpIds={signedUpIds} enableDrag={canAdd} />
      </div>
      </div>
      <CalendarDnD />
    </div>
  );
}

function MonthView({ classes, todos, assignments, monthStart, canAdd }: { classes: ClassWithRel[]; todos: TodoRow[]; assignments: AssignmentRow[]; monthStart: Date; canAdd: boolean }) {
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  const month = monthStart.getMonth();
  const isoDay = (d: Date) => d.toISOString().split("T")[0];
  const returnTo = `/calendar?view=month&d=${isoDay(monthStart)}`;
  return (
    <div>
      <div className="grid grid-cols-7 gap-px bg-border border border-border rounded-xl overflow-hidden">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-background px-3 py-2 text-xs font-medium text-muted uppercase tracking-wide">{d}</div>
        ))}
        {days.map((d) => {
          const inDay = classes.filter((c) => sameDay(new Date(c.startsAt), d));
          const dayTodos = todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), d));
          const dayAssignments = assignments.filter((a) => a.scheduledDate && sameDay(new Date(a.scheduledDate), d));
          const moreCount = Math.max(0, dayAssignments.length - 2) + Math.max(0, dayTodos.length - 2) + Math.max(0, inDay.length - 2);
          const isCurMonth = d.getMonth() === month;
          const isToday = sameDay(d, today);
          return (
            <div key={d.toISOString()} className={`group relative bg-card min-h-[110px] p-2 ${isCurMonth ? "" : "opacity-40"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${isToday ? "text-accent" : ""}`}>{d.getDate()}</span>
                {canAdd && (
                  <span className="opacity-0 group-hover:opacity-100 transition">
                    <DayQuickAdd date={isoDay(d)} returnTo={returnTo} variant="icon" />
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {dayAssignments.slice(0, 2).map((a) => (
                  <div key={a.id} className={`text-[11px] rounded px-1.5 py-0.5 truncate flex items-center gap-1 ${a.status === "completed" ? "bg-background text-muted line-through" : "bg-violet-100 text-violet-800"}`}>
                    <Dumbbell size={10} /> {a.workout.name}
                  </div>
                ))}
                {dayTodos.slice(0, 2).map((t) => (
                  t.source === "note" ? (
                    <div key={t.id} className="text-[11px] rounded px-1.5 py-0.5 truncate flex items-center gap-1 bg-sky-100 text-sky-800">
                      <StickyNote size={10} /> {t.title}
                    </div>
                  ) : (
                    <div key={t.id} className={`text-[11px] rounded px-1.5 py-0.5 truncate flex items-center gap-1 ${t.done ? "bg-background text-muted line-through" : "bg-amber-100 text-amber-800"}`}>
                      <CheckSquare size={10} /> {t.title}
                    </div>
                  )
                ))}
                {inDay.slice(0, 2).map((c) => (
                  <Link key={c.id} href={`/classes/${c.id}`} className="block text-[11px] bg-background border border-border rounded px-1.5 py-1 hover:border-accent truncate">
                    <span className="text-accent font-semibold">{formatTime(c.startsAt)}</span> {c.title}
                  </Link>
                ))}
                {moreCount > 0 && <div className="text-[10px] text-muted">+{moreCount} more</div>}
                {canAdd && inDay.length === 0 && dayTodos.length === 0 && dayAssignments.length === 0 && (
                  <span className="opacity-0 group-hover:opacity-100 transition">
                    <DayQuickAdd date={isoDay(d)} returnTo={returnTo} variant="text" label="Add" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
