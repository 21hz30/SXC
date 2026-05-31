/**
 * One-shot data wipe script. Removes all athlete / camp / workout / chat /
 * todo data but KEEPS user accounts so coaches can still log in.
 *
 * Usage:  npx tsx prisma/wipe.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  await db.chatMessage.deleteMany();
  await db.chatSession.deleteMany();
  await db.todo.deleteMany();
  await db.log.deleteMany();
  await db.performance.deleteMany();
  await db.rosterEntry.deleteMany();
  await db.classWorkout.deleteMany();
  await db.class.deleteMany();
  await db.workoutItem.deleteMany();
  await db.workout.deleteMany();
  await db.video.deleteMany();
  await db.activityData.deleteMany();
  await db.benchmark.deleteMany();
  await db.raceGoal.deleteMany();
  await db.raceResult.deleteMany();
  await db.campMember.deleteMany();
  await db.camp.deleteMany();
  await db.customer.deleteMany();

  const u = await db.user.count();
  const c = await db.customer.count();
  const ca = await db.camp.count();
  const w = await db.workout.count();
  console.log(`remaining → users:${u}  customers:${c}  camps:${ca}  workouts:${w}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
