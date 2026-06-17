import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { mintInvitationCode } from "@/lib/invitationCode";
import { formatDate } from "@/lib/utils";
import { flashUrl } from "@/lib/flash";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { Building2, Copy, KeyRound, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TenantsAdminPage() {
  await requireAdmin();

  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      coaches: {
        orderBy: { username: "asc" },
        select: { id: true, username: true, name: true, role: true, invitationCode: true },
      },
      _count: { select: { workouts: true } },
    },
  });

  // Stats per tenant: connected customers (active), camps. Both run cheap per
  // tenant since we have <10 tenants in the lifetime of this product.
  const perTenantStats = await Promise.all(
    tenants.map(async (t) => {
      const coachIds = t.coaches.map((c) => c.id);
      const [campsCount, customersCount] = await Promise.all([
        db.camp.count({ where: { coachId: { in: coachIds } } }),
        db.customerCoach.count({ where: { coachUserId: { in: coachIds }, status: "active" } }),
      ]);
      return { tenantId: t.id, campsCount, customersCount };
    }),
  );
  const statsByTenant = new Map(perTenantStats.map((s) => [s.tenantId, s]));

  async function createTenant(formData: FormData) {
    "use server";
    await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const slugRaw = String(formData.get("slug") ?? "").trim().toLowerCase();
    const coachUsername = String(formData.get("coachUsername") ?? "").trim().toLowerCase();
    const coachName = String(formData.get("coachName") ?? "").trim();
    const coachPassword = String(formData.get("coachPassword") ?? "").trim();
    if (!name || !slugRaw || !coachUsername || !coachName || !coachPassword) {
      redirect(flashUrl("/admin/tenants", "All fields are required"));
    }
    // Slug = lowercase + only [a-z0-9-]. Clamps to 24 chars.
    const slug = slugRaw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
    if (!slug) redirect(flashUrl("/admin/tenants", "Invalid slug"));
    const conflict = await db.tenant.findUnique({ where: { slug } });
    if (conflict) redirect(flashUrl("/admin/tenants", `Slug "${slug}" already exists`));
    const userConflict = await db.user.findUnique({ where: { username: coachUsername } });
    if (userConflict) redirect(flashUrl("/admin/tenants", `Username "${coachUsername}" already taken`));

    const tenant = await db.tenant.create({ data: { name, slug } });
    const passwordHash = await hashPassword(coachPassword);
    const invitationCode = mintInvitationCode(slug, coachUsername);
    await db.user.create({
      data: {
        username: coachUsername,
        passwordHash,
        name: coachName,
        role: "coach",
        tenantId: tenant.id,
        invitationCode,
      },
    });
    revalidatePath("/admin/tenants");
    redirect(flashUrl("/admin/tenants", `Tenant "${name}" created — invite code ${invitationCode}`));
  }

  // Re-roll a coach's invitation code (e.g. if leaked) without touching anything else.
  async function rotateCode(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
    if (!userId || !slug) return;
    const u = await db.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!u) return;
    let attempt = 0;
    while (attempt < 5) {
      try {
        await db.user.update({
          where: { id: userId },
          data: { invitationCode: mintInvitationCode(slug, u.username) },
        });
        break;
      } catch {
        attempt++;
      }
    }
    revalidatePath("/admin/tenants");
    redirect(flashUrl("/admin/tenants", "Invitation code rotated"));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <BackButton fallback="/" label="Back to dashboard" />
      <header className="mt-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tenants</h1>
        <p className="text-sm text-muted mt-1">
          Each tenant is a separate team. Coaches only see workouts, camps and
          customers inside their tenant. Customers can connect to coaches across
          tenants.
        </p>
      </header>

      {/* Existing tenants */}
      <section className="space-y-4 mb-8">
        {tenants.length === 0 ? (
          <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
            No tenants yet — create one below.
          </div>
        ) : (
          tenants.map((t) => {
            const stats = statsByTenant.get(t.id);
            return (
              <div key={t.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-muted" />
                      <h2 className="text-lg font-semibold">{t.name}</h2>
                      <span className="text-[11px] text-muted font-mono px-2 py-0.5 rounded-full bg-background border border-border">{t.slug}</span>
                    </div>
                    <div className="text-xs text-muted mt-1">Created {formatDate(t.createdAt)}</div>
                  </div>
                  <div className="text-xs text-muted flex items-center gap-3 tabular-nums">
                    <span>{t.coaches.length} coach{t.coaches.length === 1 ? "" : "es"}</span>
                    <span>·</span>
                    <span>{stats?.campsCount ?? 0} camps</span>
                    <span>·</span>
                    <span>{stats?.customersCount ?? 0} customers</span>
                    <span>·</span>
                    <span>{t._count.workouts} workouts</span>
                  </div>
                </div>

                <h3 className="text-[11px] text-muted uppercase tracking-wide mb-2">Coaches & invitation codes</h3>
                <ul className="divide-y divide-border bg-background rounded-xl border border-border overflow-hidden">
                  {t.coaches.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name} <span className="text-[11px] text-muted font-normal">@{c.username}</span></div>
                        <div className="text-[11px] text-muted">{c.role}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <code className="text-[11px] font-mono px-2 py-1 bg-card border border-border rounded-md">{c.invitationCode ?? "—"}</code>
                        <form action={rotateCode}>
                          <input type="hidden" name="userId" value={c.id} />
                          <input type="hidden" name="slug" value={t.slug} />
                          <ConfirmSubmit
                            message={`Rotate ${c.username}'s invitation code? The old one will stop working.`}
                            className="p-1.5 text-muted hover:text-foreground rounded-md hover:bg-card"
                          >
                            <KeyRound size={12} />
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </li>
                  ))}
                  {t.coaches.length === 0 && (
                    <li className="px-3 py-3 text-xs text-muted">No coaches yet — invite one below.</li>
                  )}
                </ul>
              </div>
            );
          })
        )}
      </section>

      {/* Create-tenant form */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <UserPlus size={13} /> New tenant + head coach
        </h2>
        <form action={createTenant} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Tenant name</label>
              <input name="name" placeholder="e.g. Bay Area Hyrox" required className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Slug</label>
              <input name="slug" placeholder="e.g. bah" required pattern="[a-z0-9-]+" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" />
              <div className="text-[10px] text-muted mt-1">Lowercase letters/digits/dashes — drives URLs and the invitation-code prefix.</div>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-[11px] text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Copy size={11} /> Head coach (created immediately)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Username</label>
                <input name="coachUsername" placeholder="e.g. johndoe" required className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Display name</label>
                <input name="coachName" placeholder="e.g. John Doe" required className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Initial password</label>
                <input name="coachPassword" placeholder="they can change it later" required minLength={6} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
              <Building2 size={14} /> Create tenant
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
