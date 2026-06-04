import { requireUser, getMyCustomerId } from "@/lib/auth";
import { db } from "@/lib/db";
import CustomerDetail from "../customers/[id]/page";

export const dynamic = "force-dynamic";

type View = "training" | "race";
type EditSection = "identity" | "hyrox" | "body" | "notes";

/**
 * "Profile" in the sidebar = your own athlete detail page. Everyone — admin,
 * coach, customer — is an athlete with exactly one profile.
 *
 * If the account has no linked profile yet (e.g. staff created before profiles
 * were linked), we provision one on the fly and link it, so Profile always
 * works instead of bouncing to the dashboard. It's marked onboarded so an
 * existing staff member isn't dropped into the athlete sign-up wizard.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ editSection?: EditSection; view?: View; logRace?: string; editGoal?: string; logBenchmark?: string; editBenchmark?: string }>;
}) {
  const user = await requireUser();
  let customerId = await getMyCustomerId();
  if (!customerId) {
    const c = await db.customer.create({ data: { name: user.name, onboardedAt: new Date() } });
    await db.user.update({ where: { id: user.id }, data: { customerId: c.id } });
    customerId = c.id;
  }
  return <CustomerDetail params={Promise.resolve({ id: customerId })} searchParams={searchParams} />;
}
