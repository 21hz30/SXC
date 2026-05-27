import { db } from "./db";

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  x.setDate(x.getDate() + diff);
  return x;
}

export async function getTodayClasses() {
  return db.class.findMany({
    where: { startsAt: { gte: startOfDay(), lte: endOfDay() } },
    orderBy: { startsAt: "asc" },
    include: { roster: true, workouts: { include: { workout: true } } },
  });
}

export async function getWeekClasses(weekStart: Date) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return db.class.findMany({
    where: { startsAt: { gte: weekStart, lt: end } },
    orderBy: { startsAt: "asc" },
    include: { roster: true },
  });
}
