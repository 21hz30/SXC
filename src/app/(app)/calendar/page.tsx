import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { startOfDay, endOfDay, startOfWeek, startOfMonth, addDays, addMonths, formatTime, sameDay } from "@/lib/utils";
import { classScope } from "@/lib/access";
import { ChevronLeft, ChevronRight, CheckSquare, StickyNote } from "lucide-react";
import DayQuickAdd from "@/components/DayQuickAdd";
import ClassSignupButton from "@/components/ClassSignupButton";

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

  // Customer self sign-up context: which of the shown classes they're on.
  const myCustomerId = isStaff ? null : await getMyCustomerId();
  const signedUpIds = new Set<string>(
    myCustomerId
      ? classes.filter((c) => c.roster.some((r) => r.customerId === myCustomerId)).map((c) => c.id)
      : [],
  );
  const canSignUp = !isStaff && !!myCustomerId;

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

      {view === "day" && <DayView classes={classes} todos={todos} cursor={cursor} canAdd={isStaff} canSignUp={canSignUp} signedUpIds={signedUpIds} />}
      {view === "week" && <WeekView classes={classes} todos={todos} weekStart={rangeStart} canAdd={isStaff} canSignUp={canSignUp} signedUpIds={signedUpIds} />}
      {view === "month" && <MonthView classes={classes} todos={todos} monthStart={rangeStart} canAdd={isStaff} />}
    </div>
  );
}

type ClassWithRel = Awaited<ReturnType<typeof db.class.findMany>>[number] & { roster: { attendance: string }[]; camp: { name: string } | null };
type TodoRow = Awaited<ReturnType<typeof db.todo.findMany>>[number];

function ClassCard({ c, canSignUp = false, signedUp = false }: { c: ClassWithRel; canSignUp?: boolean; signedUp?: boolean }) {
  const attended = c.roster.filter((r) => r.attendance === "attended").length;
  return (
    <Link href={`/classes/${c.id}`} className="block bg-card border border-border rounded-lg p-3 hover:border-accent transition">
      <div className="text-xs font-semibold text-accent">{formatTime(c.startsAt)}</div>
      <div className="text-sm font-medium leading-tight mt-0.5">{c.title}</div>
      <div className="text-xs text-muted mt-1">{c.camp?.name ?? "—"} · {c.roster.length}/{c.capacity}{attended > 0 && ` · ${attended} ✓`}</div>
      {canSignUp && (
        <div className="mt-2">
          <ClassSignupButton classId={c.id} signedUp={signedUp} isFull={c.roster.length >= c.capacity} size="xs" />
        </div>
      )}
    </Link>
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

function DayView({ classes, todos, cursor, canAdd, canSignUp, signedUpIds }: { classes: ClassWithRel[]; todos: TodoRow[]; cursor: Date; canAdd: boolean; canSignUp: boolean; signedUpIds: Set<string> }) {
  const dayTodos = todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), cursor));
  const PX_PER_HOUR = 64;

  // Each class as a positioned block: minute offset from midnight + duration.
  const events = classes
    .filter((c) => sameDay(new Date(c.startsAt), cursor))
    .map((c) => {
      const s = new Date(c.startsAt);
      const startMin = s.getHours() * 60 + s.getMinutes();
      return { c, startMin, endMin: startMin + (c.durationMin || 60), col: 0, cols: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Visible window: default 06:00–22:00, widened to fit any out-of-range class.
  let startHour = 6, endHour = 22;
  for (const e of events) {
    startHour = Math.min(startHour, Math.floor(e.startMin / 60));
    endHour = Math.max(endHour, Math.ceil(e.endMin / 60));
  }
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const gridStartMin = startHour * 60;
  const height = (endHour - startHour) * PX_PER_HOUR;

  // Lay overlapping events side by side: assign each a column, then size each
  // overlapping cluster by how many columns it spans.
  const colEnds: number[] = [];
  for (const e of events) {
    let col = colEnds.findIndex((end) => e.startMin >= end);
    if (col === -1) { col = colEnds.length; colEnds.push(e.endMin); } else colEnds[col] = e.endMin;
    e.col = col;
  }
  for (let i = 0; i < events.length; ) {
    let j = i, maxEnd = events[i].endMin, maxCol = events[i].col;
    while (j + 1 < events.length && events[j + 1].startMin < maxEnd) {
      j++; maxEnd = Math.max(maxEnd, events[j].endMin); maxCol = Math.max(maxCol, events[j].col);
    }
    for (let k = i; k <= j; k++) events[k].cols = maxCol + 1;
    i = j + 1;
  }

  const now = new Date();
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) - gridStartMin) / 60 * PX_PER_HOUR;
  const showNow = sameDay(cursor, now) && nowTop >= 0 && nowTop <= height;

  return (
    <div className="grid grid-cols-4 gap-6">
      <div className="col-span-3 bg-card border border-border rounded-xl p-3">
        <div className="relative" style={{ height }}>
          {/* Hour gridlines + labels — the line sits exactly at its offset and
              the label is centered on it, so event blocks line up with it. */}
          {hours.map((h, idx) => (
            <div key={h}>
              <div className="absolute left-12 right-1 border-t border-border" style={{ top: idx * PX_PER_HOUR }} />
              <span className="absolute left-0 w-12 -translate-y-1/2 pr-2 text-right text-[11px] text-muted tabular-nums" style={{ top: idx * PX_PER_HOUR }}>{String(h).padStart(2, "0")}:00</span>
            </div>
          ))}

          {/* Current-time indicator (Apple-style red line) */}
          {showNow && (
            <div className="absolute left-12 right-1 z-20 flex items-center -translate-y-1/2 pointer-events-none" style={{ top: nowTop }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 -ml-0.5" />
              <div className="flex-1 border-t border-red-500" />
            </div>
          )}

          {/* Event blocks, filling their time slot */}
          <div className="absolute left-12 right-1 top-0 bottom-0">
            {events.length === 0 && (
              <div className="absolute inset-x-0 top-2 text-center text-xs text-muted">No classes scheduled.</div>
            )}
            {events.map((e) => {
              const c = e.c;
              const top = (e.startMin - gridStartMin) / 60 * PX_PER_HOUR;
              const blockH = Math.max((e.endMin - e.startMin) / 60 * PX_PER_HOUR - 2, 26);
              const attended = c.roster.filter((r) => r.attendance === "attended").length;
              const showSignup = canSignUp && blockH >= 78;
              return (
                <Link
                  key={c.id}
                  href={`/classes/${c.id}`}
                  className="absolute rounded-lg border border-accent/30 border-l-[3px] border-l-accent bg-accent/10 hover:bg-accent/20 hover:border-accent transition overflow-hidden px-2 py-1"
                  style={{ top, height: blockH, left: `${(e.col / e.cols) * 100}%`, width: `calc(${(1 / e.cols) * 100}% - 4px)` }}
                >
                  <div className="text-[11px] font-semibold text-accent leading-none">{formatTime(c.startsAt)}</div>
                  <div className="text-xs font-medium leading-tight mt-0.5 truncate">{c.title}</div>
                  <div className="text-[11px] text-muted mt-0.5 truncate">{c.camp?.name ?? "—"} · {c.roster.length}/{c.capacity}{attended > 0 ? ` · ${attended} ✓` : ""}</div>
                  {showSignup && (
                    <div className="mt-1.5">
                      <ClassSignupButton classId={c.id} signedUp={signedUpIds.has(c.id)} isFull={c.roster.length >= c.capacity} size="xs" />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
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
  );
}

function WeekView({ classes, todos, weekStart, canAdd, canSignUp, signedUpIds }: { classes: ClassWithRel[]; todos: TodoRow[]; weekStart: Date; canAdd: boolean; canSignUp: boolean; signedUpIds: Set<string> }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const isoDay = (d: Date) => d.toISOString().split("T")[0];
  const returnTo = `/calendar?view=week&d=${isoDay(weekStart)}`;
  return (
    // A bordered 7-column grid (gap-px over a border background draws the grid
    // lines) so each day reads as its own cell, with a header strip on top —
    // matching the month view's structure.
    <div className="grid grid-cols-7 gap-px bg-border border border-border rounded-xl overflow-hidden">
      {days.map((d) => {
        const isToday = sameDay(d, today);
        const inDay = classes.filter((c) => sameDay(new Date(c.startsAt), d));
        const dayTodos = todos.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), d));
        const empty = inDay.length === 0 && dayTodos.length === 0;
        return (
          <div key={d.toISOString()} className="group bg-card min-h-[460px] flex flex-col">
            {/* Day header */}
            <div className={`flex items-center justify-between px-2 py-2 border-b border-border ${isToday ? "bg-accent/10" : "bg-background"}`}>
              <span className={`text-xs font-medium uppercase tracking-wide ${isToday ? "text-accent" : "text-muted"}`}>
                {d.toLocaleDateString("en-US", { weekday: "short" })}{" "}
                <span className={`text-sm ${isToday ? "font-bold" : "font-semibold text-foreground"}`}>{d.getDate()}</span>
              </span>
              {canAdd && (
                <span className="opacity-0 group-hover:opacity-100 transition">
                  <DayQuickAdd date={isoDay(d)} returnTo={returnTo} variant="icon" />
                </span>
              )}
            </div>
            {/* Day body */}
            <div className="flex-1 p-2 space-y-2">
              {dayTodos.map((t) => <TodoCard key={t.id} t={t} />)}
              {inDay.map((c) => <ClassCard key={c.id} c={c} canSignUp={canSignUp} signedUp={signedUpIds.has(c.id)} />)}
              {empty && (
                canAdd ? (
                  <span className="opacity-0 group-hover:opacity-100 transition block">
                    <DayQuickAdd date={isoDay(d)} returnTo={returnTo} variant="text" label="Add" />
                  </span>
                ) : (
                  <div className="text-[11px] text-muted/60">—</div>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ classes, todos, monthStart, canAdd }: { classes: ClassWithRel[]; todos: TodoRow[]; monthStart: Date; canAdd: boolean }) {
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
                {inDay.length + dayTodos.length > 4 && <div className="text-[10px] text-muted">+{inDay.length + dayTodos.length - 4} more</div>}
                {canAdd && inDay.length === 0 && dayTodos.length === 0 && (
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
