import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const db = new PrismaClient({ adapter });

function daysFromNow(d: number, hour = 7, min = 0) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(hour, min, 0, 0);
  return x;
}

async function main() {
  // Wipe everything (cascade does most of the work, but be explicit for clarity)
  await db.chatMessage.deleteMany();
  await db.chatSession.deleteMany();
  await db.log.deleteMany();
  await db.performance.deleteMany();
  await db.rosterEntry.deleteMany();
  await db.classWorkout.deleteMany();
  await db.class.deleteMany();
  await db.workoutItem.deleteMany();
  await db.workoutCamp.deleteMany();
  await db.workout.deleteMany();
  await db.video.deleteMany();
  await db.activityData.deleteMany();
  await db.benchmark.deleteMany();
  await db.campMember.deleteMany();
  await db.camp.deleteMany();
  await db.todo.deleteMany();
  await db.customer.deleteMany();
  await db.user.deleteMany();

  // Users
  const peter = await db.user.create({
    data: { username: "peter", passwordHash: await bcrypt.hash("peter123", 10), name: "Peter Zhang", role: "admin" },
  });
  const src = await db.user.create({
    data: { username: "src", passwordHash: await bcrypt.hash("src123", 10), name: "SRC Coach", role: "coach" },
  });

  // Customers
  const customers = await Promise.all(
    [
      { name: "Alex Chen", gender: "male", division: "pro", age: 32, weightKg: 78, heightCm: 178, hyroxPbSec: 70 * 60 + 12, tags: "competing,Oct" },
      { name: "Maya Rodríguez", gender: "female", division: "open", age: 28, weightKg: 62, heightCm: 165, hyroxPbSec: 78 * 60 + 30, tags: "intermediate" },
      { name: "Jordan Park", gender: "male", division: "pro", age: 35, weightKg: 84, heightCm: 182, hyroxPbSec: 65 * 60 + 45, tags: "elite,pro" },
      { name: "Sofia Bauer", gender: "female", division: "open", age: 41, weightKg: 70, heightCm: 170, hyroxPbSec: 95 * 60, tags: "masters" },
      { name: "Tom Whitfield", gender: "male", division: "open", age: 26, weightKg: 92, heightCm: 188, tags: "beginner" },
      { name: "Priya Shah", gender: "female", division: "open", age: 30, weightKg: 58, heightCm: 162, hyroxPbSec: 82 * 60, tags: "intermediate" },
      { name: "Liam O'Connor", gender: "male", division: "open", age: 38, weightKg: 88, heightCm: 184, hyroxPbSec: 72 * 60 + 20, tags: "competing,Oct" },
      { name: "Naomi Tanaka", gender: "female", division: "doubles", age: 24, weightKg: 60, heightCm: 168, hyroxPbSec: 88 * 60 + 10, tags: "new" },
    ].map((c) =>
      db.customer.create({
        data: {
          ...c,
          email: c.name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com",
          goalRaceDate: daysFromNow(120, 9, 0),
        },
      })
    )
  );

  // Benchmarks
  const benchSpec = [
    { metric: "1km_run_sec", unit: "sec", base: 240, spread: 60 },
    { metric: "wall_ball_unbroken", unit: "reps", base: 35, spread: 30 },
    { metric: "deadlift_1rm_kg", unit: "kg", base: 130, spread: 50 },
    { metric: "row_500m_sec", unit: "sec", base: 100, spread: 20 },
    { metric: "sled_push_kg", unit: "kg", base: 100, spread: 40 },
  ];
  for (const c of customers) {
    for (const b of benchSpec) {
      await db.benchmark.create({
        data: { customerId: c.id, metric: b.metric, unit: b.unit, value: b.base + Math.round((Math.random() - 0.5) * b.spread) },
      });
    }
  }

  // Activity data
  const activityTypes = ["run", "row", "ski", "hyrox_sim"];
  for (const c of customers) {
    for (let d = -14; d <= 0; d++) {
      if (Math.random() < 0.4) continue;
      const type = activityTypes[Math.floor(Math.random() * activityTypes.length)];
      const dur = 1500 + Math.floor(Math.random() * 3000);
      await db.activityData.create({
        data: {
          customerId: c.id,
          date: daysFromNow(d, 7, 0),
          activityType: type,
          durationSec: dur,
          distanceM: type === "run" ? Math.floor(dur * 3) : type === "row" || type === "ski" ? Math.floor(dur * 4) : null,
          avgHr: 140 + Math.floor(Math.random() * 30),
          maxHr: 170 + Math.floor(Math.random() * 25),
          avgPaceSec: type === "run" ? 240 + Math.floor(Math.random() * 60) : null,
          avgCadence: type === "run" ? 165 + Math.floor(Math.random() * 15) : null,
          caloriesKcal: 300 + Math.floor(Math.random() * 400),
        },
      });
    }
  }

  // -----------------------------------------------------------------
  // Workouts (structured items)
  // -----------------------------------------------------------------
  type ItemSeed = {
    category: string;
    label?: string;
    distanceM?: number;
    timeSec?: number;
    weightKg?: number;
    reps?: number;
    sets?: number;
    paceSecPerKm?: number;
    heightM?: number;
    notes?: string;
  };
  async function createWorkout(name: string, description: string, items: ItemSeed[]) {
    const w = await db.workout.create({ data: { name, description } });
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await db.workoutItem.create({
        data: {
          workoutId: w.id,
          order: i,
          category: it.category,
          label: it.label ?? null,
          distanceM: it.distanceM ?? null,
          timeSec: it.timeSec ?? null,
          weightKg: it.weightKg ?? null,
          reps: it.reps ?? null,
          sets: it.sets ?? null,
          paceSecPerKm: it.paceSecPerKm ?? null,
          heightM: it.heightM ?? null,
          notes: it.notes ?? null,
        },
      });
    }
    return w;
  }

  const wHyroxSim = await createWorkout("Hyrox Simulation", "Full 8-station race simulation with compromised running.", [
    { category: "run", distanceM: 1000, paceSecPerKm: 250, notes: "@ goal race pace" },
    { category: "ski", distanceM: 1000, paceSecPerKm: 240 },
    { category: "run", distanceM: 1000, paceSecPerKm: 260, notes: "+10s on race pace" },
    { category: "sled_push", distanceM: 50, weightKg: 152 },
    { category: "run", distanceM: 1000, paceSecPerKm: 265 },
    { category: "sled_pull", distanceM: 50, weightKg: 103 },
    { category: "run", distanceM: 1000, paceSecPerKm: 265 },
    { category: "burpee", distanceM: 80, reps: 40 },
    { category: "run", distanceM: 1000, paceSecPerKm: 270 },
    { category: "row", distanceM: 1000, paceSecPerKm: 240 },
    { category: "run", distanceM: 1000, paceSecPerKm: 270 },
    { category: "farmers", distanceM: 200, weightKg: 24, notes: "kettlebells, per hand" },
    { category: "run", distanceM: 1000, paceSecPerKm: 275 },
    { category: "lunges", distanceM: 100, weightKg: 20, notes: "sandbag, alternating" },
    { category: "run", distanceM: 1000, paceSecPerKm: 275 },
    { category: "wallball", reps: 100, weightKg: 9, heightM: 3.0 },
  ]);

  const wCompro = await createWorkout("Compromised Running + Wall Ball", "Engine work for the back half of the race.", [
    { category: "run", distanceM: 2000, paceSecPerKm: 300, label: "Easy warmup", notes: "@ Z2" },
    { category: "run", distanceM: 800, paceSecPerKm: 220, sets: 5, label: "Round: 800m run" },
    { category: "wallball", reps: 30, weightKg: 9, heightM: 3.0, sets: 5, label: "Round: wall balls" },
    { category: "rest", timeSec: 60, sets: 5, label: "Round: rest" },
    { category: "run", distanceM: 1000, paceSecPerKm: 320, label: "Cooldown" },
  ]);

  const wStrength = await createWorkout("Strength: Posterior Chain", "Deadlift focus + sled accessory.", [
    { category: "strength", label: "Deadlift", sets: 5, reps: 3, weightKg: 0, notes: "@ 80% 1RM (load per athlete)" },
    { category: "strength", label: "Romanian DL", sets: 3, reps: 8, weightKg: 0, notes: "load per athlete" },
    { category: "sled_push", distanceM: 20, weightKg: 180, sets: 6, label: "Heavy sled push" },
    { category: "strength", label: "Hamstring curls", sets: 3, reps: 12 },
  ]);

  const wPush = await createWorkout("Push Station Drills", "Sled & wall ball capacity work.", [
    { category: "sled_push", distanceM: 25, weightKg: 152, sets: 4, label: "Sled push intervals" },
    { category: "sled_pull", distanceM: 25, weightKg: 103, sets: 4, label: "Sled pull intervals" },
    { category: "wallball", reps: 50, weightKg: 9, heightM: 3.0, sets: 3 },
    { category: "rest", timeSec: 90, sets: 3 },
  ]);

  // Camps
  const fallCamp = await db.camp.create({
    data: { name: "Fall Hyrox Prep", description: "8-week build to October race.", startDate: daysFromNow(-21), endDate: daysFromNow(35), coachId: src.id },
  });
  const beginnerCamp = await db.camp.create({
    data: { name: "Hyrox 101 — Beginners", description: "Intro to Hyrox-style training.", startDate: daysFromNow(-7), endDate: daysFromNow(49), coachId: src.id },
  });
  const eliteCamp = await db.camp.create({
    data: { name: "Pro Team", description: "Elite athletes — pre-season block.", startDate: daysFromNow(-30), endDate: daysFromNow(60), coachId: peter.id },
  });

  await db.campMember.createMany({ data: [
    { campId: fallCamp.id, customerId: customers[0].id },
    { campId: fallCamp.id, customerId: customers[1].id },
    { campId: fallCamp.id, customerId: customers[6].id },
    { campId: beginnerCamp.id, customerId: customers[4].id },
    { campId: beginnerCamp.id, customerId: customers[7].id },
    { campId: beginnerCamp.id, customerId: customers[3].id },
    { campId: eliteCamp.id, customerId: customers[2].id },
    { campId: eliteCamp.id, customerId: customers[5].id },
  ] });

  await db.workoutCamp.createMany({ data: [
    { workoutId: wHyroxSim.id, campId: fallCamp.id },
    { workoutId: wCompro.id, campId: fallCamp.id },
    { workoutId: wPush.id, campId: fallCamp.id },
    { workoutId: wCompro.id, campId: beginnerCamp.id },
    { workoutId: wHyroxSim.id, campId: eliteCamp.id },
    { workoutId: wStrength.id, campId: eliteCamp.id },
    { workoutId: wPush.id, campId: eliteCamp.id },
  ] });

  // Classes (each can have multiple workouts)
  const classDefs: { d: number; h: number; title: string; campId: string; workoutIds: string[] }[] = [
    { d: -3, h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wCompro.id] },
    { d: -2, h: 18, title: "Strength Night",        campId: eliteCamp.id,   workoutIds: [wStrength.id] },
    { d: -1, h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wHyroxSim.id] },
    { d: 0,  h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wCompro.id, wPush.id] },
    { d: 0,  h: 9,  title: "Beginners Intro",       campId: beginnerCamp.id,workoutIds: [wCompro.id] },
    { d: 0,  h: 18, title: "Evening Engine",        campId: fallCamp.id,    workoutIds: [wCompro.id] },
    { d: 1,  h: 7,  title: "Hyrox Simulation",      campId: fallCamp.id,    workoutIds: [wHyroxSim.id] },
    { d: 2,  h: 18, title: "Pro Team Strength",     campId: eliteCamp.id,   workoutIds: [wStrength.id, wPush.id] },
    { d: 3,  h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wCompro.id] },
    { d: 3,  h: 9,  title: "Beginners Run + WB",    campId: beginnerCamp.id,workoutIds: [wCompro.id] },
    { d: 5,  h: 9,  title: "Saturday Long Session", campId: fallCamp.id,    workoutIds: [wHyroxSim.id] },
    { d: 6,  h: 10, title: "Pro Team Sim",          campId: eliteCamp.id,   workoutIds: [wHyroxSim.id] },
  ];

  for (const cd of classDefs) {
    const cls = await db.class.create({
      data: {
        title: cd.title,
        startsAt: daysFromNow(cd.d, cd.h, 0),
        durationMin: 60,
        location: "SXC Box — Main Floor",
        capacity: 12,
        campId: cd.campId,
      },
    });
    for (let i = 0; i < cd.workoutIds.length; i++) {
      await db.classWorkout.create({ data: { classId: cls.id, workoutId: cd.workoutIds[i], order: i } });
    }
    const members = await db.campMember.findMany({ where: { campId: cd.campId } });
    const feelings = ["legs heavy", "felt strong", "good engine, slow sled", "tired but pushed", "fresh", "grip gave out"];
    for (const m of members) {
      const attended = cd.d < 0 ? Math.random() < 0.85 : false;
      await db.rosterEntry.create({
        data: { classId: cls.id, customerId: m.customerId, attendance: cd.d < 0 ? (attended ? "attended" : "no_show") : "pending" },
      });
      // Log performance/recovery for past sessions the athlete attended, so the
      // athlete profile shows a fatigue/RPE/feeling trend across weeks.
      if (attended) {
        const fatigue = 40 + Math.floor(Math.random() * 55); // 40–95%
        const injury = Math.random() < 0.12 ? "tight L hamstring — monitor" : null;
        await db.performance.create({
          data: {
            classId: cls.id,
            customerId: m.customerId,
            status: Math.random() < 0.85 ? "completed" : "partial",
            rpe: 5 + Math.floor(Math.random() * 5), // 5–9
            fatiguePct: fatigue,
            feeling: feelings[Math.floor(Math.random() * feelings.length)],
            injuryNote: injury,
          },
        });
      }
    }
  }

  // Sample todos
  await db.todo.createMany({ data: [
    { ownerId: peter.id, title: "Mark attendance for today's class", dueDate: daysFromNow(0, 18, 0), source: "manual" },
    { ownerId: peter.id, title: "Send Alex Chen Hyrox prep plan", dueDate: daysFromNow(2), source: "manual" },
    { ownerId: peter.id, title: "Review beginners camp progress", source: "manual" },
    { ownerId: src.id, title: "Plan next week's strength block", dueDate: daysFromNow(3), source: "manual" },
    { ownerId: src.id, title: "Film wall ball demo video", source: "manual" },
  ]});

  console.log("Seed complete.");
  console.log("  peter / peter123 (admin)");
  console.log("  src / src123 (coach)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
