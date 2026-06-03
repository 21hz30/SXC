import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * "Profile" in the sidebar = your own athlete detail page. Everyone (admin,
 * coach, customer) has exactly one linked profile, so we just resolve it and
 * hand off to the shared customer-detail view in self mode.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { customerId: true },
  });
  if (u?.customerId) redirect(`/customers/${u.customerId}`);
  // Every account is linked on creation; this is just a safety net.
  redirect("/");
}
