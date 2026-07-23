"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarDays, Check, Dumbbell, Plus, Search, Send, Trash2, UsersRound } from "lucide-react";
import { mondayOf } from "@/lib/utils";

export type WeeklyPlanSubscriber = {
  id: string;
  name: string;
  detail: string | null;
  coachNames: string[];
};

export type WeeklyPlanWorkout = {
  id: string;
  name: string;
  type: string | null;
  tags: string | null;
};

type WorkoutRow = { key: number; workoutId: string; note: string };
type PlanDay = { workouts: WorkoutRow[] };

function emptyWeek(): PlanDay[] {
  return Array.from({ length: 7 }, () => ({ workouts: [] }));
}

function dayInfo(weekStart: string, dayIndex: number) {
  const base = new Date(`${weekStart}T00:00:00Z`);
  const date = new Date(base.getTime() + dayIndex * 86_400_000);
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

export default function WeeklyAssignmentBuilder({
  subscribers,
  workouts,
  defaultWeek,
  action,
}: {
  subscribers: WeeklyPlanSubscriber[];
  workouts: WeeklyPlanWorkout[];
  defaultWeek: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const nextKey = useRef(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [weekStart, setWeekStart] = useState(defaultWeek);
  const [days, setDays] = useState<PlanDay[]>(emptyWeek);

  const filteredSubscribers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return subscribers;
    return subscribers.filter((subscriber) =>
      [subscriber.name, subscriber.detail ?? "", ...subscriber.coachNames].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, subscribers]);

  const totalWorkouts = days.reduce((total, day) => total + day.workouts.filter((row) => row.workoutId).length, 0);
  const totalAssignments = totalWorkouts * selected.size;
  const payload = JSON.stringify({
    weekStart,
    customerIds: [...selected],
    days: days.map((day) => ({
      workouts: day.workouts
        .filter((row) => row.workoutId)
        .map((row) => ({ workoutId: row.workoutId, note: row.note.trim() })),
    })),
  });

  function toggleSubscriber(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected((current) => {
      const next = new Set(current);
      filteredSubscribers.forEach((subscriber) => next.add(subscriber.id));
      return next;
    });
  }

  function updateDay(dayIndex: number, update: (day: PlanDay) => PlanDay) {
    setDays((current) => current.map((day, index) => (index === dayIndex ? update(day) : day)));
  }

  function addWorkout(dayIndex: number) {
    nextKey.current += 1;
    const row = { key: nextKey.current, workoutId: "", note: "" };
    updateDay(dayIndex, (day) => ({ ...day, workouts: [...day.workouts, row] }));
  }

  function patchWorkout(dayIndex: number, key: number, patch: Partial<WorkoutRow>) {
    updateDay(dayIndex, (day) => ({
      ...day,
      workouts: day.workouts.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  }

  function removeWorkout(dayIndex: number, key: number) {
    updateDay(dayIndex, (day) => ({ ...day, workouts: day.workouts.filter((row) => row.key !== key) }));
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="plan" value={payload} />

      <section aria-labelledby="recipients-heading">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-accent">
              <UsersRound size={17} />
              <h2 id="recipients-heading" className="text-sm font-semibold text-foreground">Recipients</h2>
            </div>
            <div className="text-xs text-muted">{selected.size} selected</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={selectVisible} disabled={filteredSubscribers.length === 0} className="text-xs font-medium text-accent disabled:text-muted">
              Select all
            </button>
            <span className="text-border">/</span>
            <button type="button" onClick={() => setSelected(new Set())} disabled={selected.size === 0} className="text-xs font-medium text-muted hover:text-foreground disabled:opacity-40">
              Clear
            </button>
          </div>
        </div>

        <div className="border-y border-border bg-card">
          <label className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search size={16} className="shrink-0 text-muted" />
            <span className="sr-only">Search subscribers</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search subscribers"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>
          <div className="max-h-72 overflow-y-auto">
            {filteredSubscribers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">No active subscribers</div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredSubscribers.map((subscriber) => {
                  const checked = selected.has(subscriber.id);
                  return (
                    <li key={subscriber.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-background">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSubscriber(subscriber.id)}
                          className="sr-only"
                        />
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? "border-foreground bg-foreground text-white" : "border-border bg-white"}`}>
                          {checked ? <Check size={13} strokeWidth={3} /> : null}
                        </span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted" data-no-i18n>
                          {initials(subscriber.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium" data-no-i18n>{subscriber.name}</span>
                          <span className="block truncate text-[11px] text-muted" data-no-i18n>
                            {[subscriber.detail, subscriber.coachNames.join(", ")].filter(Boolean).join(" · ") || "Active subscriber"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="schedule-heading">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-accent">
              <CalendarDays size={17} />
              <h2 id="schedule-heading" className="text-sm font-semibold text-foreground">Schedule</h2>
            </div>
            <div className="text-xs text-muted">{totalWorkouts} workouts</div>
          </div>
          <label className="w-full sm:w-auto">
            <span className="mb-1 block text-[11px] font-medium text-muted">Week</span>
            <input
              type="date"
              value={weekStart}
              onChange={(event) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setWeekStart(mondayOf(event.target.value));
              }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm sm:w-44"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {days.map((day, dayIndex) => {
            const info = dayInfo(weekStart, dayIndex);
            return (
              <div key={dayIndex} className="flex min-h-40 flex-col rounded-lg border border-border bg-card p-3">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold">{info.weekday}</span>
                  <span className="text-[11px] tabular-nums text-muted">{info.date}</span>
                </div>
                <div className="space-y-2">
                  {day.workouts.map((row) => (
                    <div key={row.key} className="border-l-2 border-accent pl-2">
                      <div className="flex items-center gap-1.5">
                        <Dumbbell size={14} className="shrink-0 text-muted" />
                        <select
                          value={row.workoutId}
                          onChange={(event) => patchWorkout(dayIndex, row.key, { workoutId: event.target.value })}
                          aria-label={`${info.weekday} workout`}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-xs"
                        >
                          <option value="">Pick workout</option>
                          {workouts.map((workout) => (
                            <option key={workout.id} value={workout.id}>{workout.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeWorkout(dayIndex, row.key)}
                          title="Remove workout"
                          aria-label="Remove workout"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <input
                        value={row.note}
                        maxLength={500}
                        onChange={(event) => patchWorkout(dayIndex, row.key, { note: event.target.value })}
                        placeholder="Coach note"
                        className="mt-1.5 w-full rounded-lg border border-border px-2 py-1.5 text-xs"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addWorkout(dayIndex)}
                  disabled={workouts.length === 0 || day.workouts.length >= 8}
                  className="mt-auto inline-flex items-center gap-1 self-start pt-3 text-xs font-medium text-accent disabled:text-muted"
                >
                  <Plus size={14} /> Add workout
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 border-y border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted">Assignment summary</div>
          <div className="mt-0.5 text-sm font-semibold">
            {totalWorkouts > 0 && selected.size > 0
              ? `${totalWorkouts} workouts × ${selected.size} subscribers = ${totalAssignments} assignments`
              : "No workouts selected"}
          </div>
        </div>
        <AssignButton disabled={totalAssignments === 0} />
      </section>
    </form>
  );
}

function AssignButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
    >
      {pending ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden /> : <Send size={16} />}
      {pending ? "Assigning" : "Assign weekly plan"}
    </button>
  );
}
