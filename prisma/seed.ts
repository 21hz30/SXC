import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: url });
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
  await db.raceResult.deleteMany();
  await db.raceGoal.deleteMany();
  await db.performance.deleteMany();
  await db.rosterEntry.deleteMany();
  await db.classWorkout.deleteMany();
  await db.class.deleteMany();
  await db.workoutItem.deleteMany();
  await db.workout.deleteMany();
  await db.video.deleteMany();
  await db.activityData.deleteMany();
  await db.benchmark.deleteMany();
  await db.campMember.deleteMany();
  await db.camp.deleteMany();
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

  // Benchmarks — the Hyrox race: 1km run + the 8 stations (all timed, seconds).
  const benchSpec = [
    { metric: "1km_run_sec", unit: "sec", base: 255, spread: 60 },
    { metric: "ski_1000m_sec", unit: "sec", base: 235, spread: 40 },
    { metric: "sled_push_50m_sec", unit: "sec", base: 155, spread: 50 },
    { metric: "sled_pull_50m_sec", unit: "sec", base: 160, spread: 50 },
    { metric: "burpee_broad_jump_80m_sec", unit: "sec", base: 275, spread: 60 },
    { metric: "row_1000m_sec", unit: "sec", base: 240, spread: 40 },
    { metric: "farmers_carry_200m_sec", unit: "sec", base: 120, spread: 30 },
    { metric: "sandbag_lunges_100m_sec", unit: "sec", base: 310, spread: 60 },
    { metric: "wall_balls_100_sec", unit: "sec", base: 380, spread: 80 },
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
  // Two camps only: one Open (general roster, beginners + intermediate) and
  // one Pro (elite block). Open absorbs what used to be "Hyrox 101 — Beginners".
  const fallCamp = await db.camp.create({
    data: { name: "Fall Hyrox Prep", description: "Open camp — 8-week build to October race. Beginners welcome.", division: "open", startDate: daysFromNow(-21), endDate: daysFromNow(49), coachId: src.id, createdById: src.id },
  });
  const eliteCamp = await db.camp.create({
    data: { name: "Pro Team", description: "Pro camp — elite athletes, pre-season block.", division: "pro", startDate: daysFromNow(-30), endDate: daysFromNow(60), coachId: peter.id, createdById: peter.id },
  });

  await db.campMember.createMany({ data: [
    { campId: fallCamp.id, customerId: customers[0].id },
    { campId: fallCamp.id, customerId: customers[1].id },
    { campId: fallCamp.id, customerId: customers[6].id },
    { campId: fallCamp.id, customerId: customers[4].id },
    { campId: fallCamp.id, customerId: customers[7].id },
    { campId: fallCamp.id, customerId: customers[3].id },
    { campId: eliteCamp.id, customerId: customers[2].id },
    { campId: eliteCamp.id, customerId: customers[5].id },
  ] });

  // Classes (each can have multiple workouts)
  const classDefs: { d: number; h: number; title: string; campId: string; workoutIds: string[]; dropIn?: boolean }[] = [
    { d: -3, h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wCompro.id] },
    { d: -2, h: 18, title: "Strength Night",        campId: eliteCamp.id,   workoutIds: [wStrength.id] },
    { d: -1, h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wHyroxSim.id] },
    { d: 0,  h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wCompro.id, wPush.id] },
    { d: 0,  h: 9,  title: "Beginners Intro",       campId: fallCamp.id,workoutIds: [wCompro.id], dropIn: true },
    { d: 0,  h: 18, title: "Evening Engine",        campId: fallCamp.id,    workoutIds: [wCompro.id], dropIn: true },
    { d: 1,  h: 7,  title: "Hyrox Simulation",      campId: fallCamp.id,    workoutIds: [wHyroxSim.id] },
    { d: 2,  h: 18, title: "Pro Team Strength",     campId: eliteCamp.id,   workoutIds: [wStrength.id, wPush.id] },
    { d: 3,  h: 7,  title: "Open Hyrox Class",      campId: fallCamp.id,    workoutIds: [wCompro.id] },
    { d: 3,  h: 9,  title: "Beginners Run + WB",    campId: fallCamp.id,workoutIds: [wCompro.id] },
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
        dropInAllowed: cd.dropIn ?? false,
        createdById: cd.campId === eliteCamp.id ? peter.id : src.id,
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
        // Per-workout feedback: every workout in this class gets its own row.
        for (const wid of cd.workoutIds) {
          const fatigue = 40 + Math.floor(Math.random() * 55); // 40–95%
          const injury = Math.random() < 0.08 ? "tight L hamstring — monitor" : null;
          await db.performance.create({
            data: {
              classId: cls.id,
              customerId: m.customerId,
              workoutId: wid,
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
  }

  // Sample race results & goals — give a couple of athletes a race history
  // across divisions so the Race tab demos PB-per-division, splits, radar.
  const alex = customers.find((c) => c.name === "Alex Chen")!;
  const jordan = customers.find((c) => c.name === "Jordan Park")!;
  const maya = customers.find((c) => c.name === "Maya Rodríguez")!;

  await db.raceResult.createMany({
    data: [
      // Alex (Pro): two races, second is a PB.
      { customerId: alex.id, eventName: "Hyrox Berlin", eventDate: daysFromNow(-180), division: "pro", totalSec: 71*60+45, roxzoneSec: 190,
        run1Sec: 285, run2Sec: 290, run3Sec: 295, run4Sec: 300, run5Sec: 305, run6Sec: 310, run7Sec: 315, run8Sec: 320,
        skiSec: 245, sledPushSec: 160, sledPullSec: 165, burpeeSec: 280, rowSec: 245, farmersSec: 125, lungesSec: 320, wallballsSec: 390,
        notes: "Solid base but faded late." },
      { customerId: alex.id, eventName: "Hyrox London", eventDate: daysFromNow(-60), division: "pro", totalSec: 70*60+12, roxzoneSec: 175,
        run1Sec: 280, run2Sec: 282, run3Sec: 288, run4Sec: 290, run5Sec: 295, run6Sec: 302, run7Sec: 305, run8Sec: 310,
        skiSec: 235, sledPushSec: 155, sledPullSec: 160, burpeeSec: 270, rowSec: 240, farmersSec: 120, lungesSec: 305, wallballsSec: 370,
        notes: "PB. Better sled split." },
      // Alex Open division (one-off)
      { customerId: alex.id, eventName: "Hyrox Manchester", eventDate: daysFromNow(-300), division: "open", totalSec: 73*60+30, roxzoneSec: 200,
        run1Sec: 295, run2Sec: 300, run3Sec: 305, run4Sec: 310, run5Sec: 315, run6Sec: 320, run7Sec: 325, run8Sec: 330,
        skiSec: 250, sledPushSec: 170, sledPullSec: 175, burpeeSec: 290, rowSec: 255, farmersSec: 130, lungesSec: 330, wallballsSec: 410 },
      // Jordan (Pro): elite times
      { customerId: jordan.id, eventName: "Hyrox Berlin", eventDate: daysFromNow(-180), division: "pro", totalSec: 65*60+45, roxzoneSec: 150,
        run1Sec: 260, run2Sec: 262, run3Sec: 265, run4Sec: 268, run5Sec: 270, run6Sec: 275, run7Sec: 278, run8Sec: 280,
        skiSec: 215, sledPushSec: 125, sledPullSec: 128, burpeeSec: 245, rowSec: 215, farmersSec: 108, lungesSec: 275, wallballsSec: 340 },
      // Maya (Open)
      { customerId: maya.id, eventName: "Hyrox Madrid", eventDate: daysFromNow(-90), division: "open", totalSec: 78*60+30, roxzoneSec: 200,
        run1Sec: 320, run2Sec: 325, run3Sec: 330, run4Sec: 335, run5Sec: 340, run6Sec: 345, run7Sec: 350, run8Sec: 355,
        skiSec: 275, sledPushSec: 185, sledPullSec: 185, burpeeSec: 305, rowSec: 275, farmersSec: 138, lungesSec: 335, wallballsSec: 425,
        notes: "First race — strong pacing." },
    ],
  });

  // A target goal for Alex (Pro): trim 3 min off the total
  await db.raceGoal.create({
    data: {
      customerId: alex.id, division: "pro",
      targetTotalSec: 67*60, targetDate: daysFromNow(120),
      targetSkiSec: 225, targetSledPushSec: 145, targetSledPullSec: 150,
      targetBurpeeSec: 260, targetRowSec: 230, targetFarmersSec: 115,
      targetLungesSec: 290, targetWallballsSec: 355, targetRunSec: 280,
    },
  });

  console.log("Seed complete.");
  console.log("  peter / peter123 (admin)");
  console.log("  src / src123 (coach)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
