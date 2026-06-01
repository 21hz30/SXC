"use server";

/**
 * Video backend — intentionally kept even though the customer UI no longer
 * surfaces videos. The Video table and this upload capability remain so the
 * feature can be re-enabled later without a migration or data loss.
 *
 * To bring the UI back, import `uploadCustomerVideo` into the customer page,
 * re-add the upload form + video grid, and re-include `videos` in the query.
 */

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "./db";
import { requireUser } from "./auth";
import { revalidatePath } from "next/cache";

export async function uploadCustomerVideo(customerId: string, formData: FormData) {
  await requireUser();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;
  const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const filename = `${customerId}_${randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buf);
  await db.video.create({
    data: {
      customerId,
      title: String(formData.get("title") ?? file.name),
      filePath: `/uploads/${filename}`,
      exercise: String(formData.get("exercise") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function deleteCustomerVideo(videoId: string) {
  await requireUser();
  const v = await db.video.findUnique({ where: { id: videoId } });
  if (!v) return;
  await db.video.delete({ where: { id: videoId } });
  revalidatePath(`/customers/${v.customerId}`);
}
