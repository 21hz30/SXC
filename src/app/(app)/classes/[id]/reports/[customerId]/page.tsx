import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessCamp } from "@/lib/access";
import { flashUrl } from "@/lib/flash";
import { formatDate, formatTime } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Markdown from "@/components/Markdown";
import { generateClassReport, upsertReport } from "@/domain/reports";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; customerId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await requireUser();
  const { id, customerId } = await params;
  const { edit } = await searchParams;

  const cls = await db.class.findUnique({
    where: { id },
    include: { camp: true },
  });
  if (!cls) notFound();
  if (cls.camp && !canAccessCamp(user, cls.camp)) redirect("/calendar");

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) notFound();

  const existing = await db.classReport.findUnique({
    where: { classId_customerId: { classId: id, customerId } },
  });

  async function generate() {
    "use server";
    const { contentMarkdown, model } = await generateClassReport(id, customerId);
    await upsertReport(id, customerId, contentMarkdown, model);
    revalidatePath(`/classes/${id}/reports/${customerId}`);
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}/reports/${customerId}`, "Report generated"));
  }

  async function save(formData: FormData) {
    "use server";
    const content = String(formData.get("content") ?? "").trim();
    if (!content) return;
    await db.classReport.update({
      where: { classId_customerId: { classId: id, customerId } },
      data: { contentMarkdown: content },
    });
    revalidatePath(`/classes/${id}/reports/${customerId}`);
    redirect(flashUrl(`/classes/${id}/reports/${customerId}`, "Report updated"));
  }

  async function publish() {
    "use server";
    await db.classReport.update({
      where: { classId_customerId: { classId: id, customerId } },
      data: { publishedAt: new Date() },
    });
    revalidatePath(`/classes/${id}/reports/${customerId}`);
    redirect(flashUrl(`/classes/${id}/reports/${customerId}`, "Report published to athlete"));
  }

  async function unpublish() {
    "use server";
    await db.classReport.update({
      where: { classId_customerId: { classId: id, customerId } },
      data: { publishedAt: null },
    });
    revalidatePath(`/classes/${id}/reports/${customerId}`);
    redirect(flashUrl(`/classes/${id}/reports/${customerId}`, "Report unpublished"));
  }

  async function deleteReport() {
    "use server";
    await db.classReport.delete({
      where: { classId_customerId: { classId: id, customerId } },
    });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, "Report deleted"));
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <BackButton fallback={`/classes/${id}`} label="Back to class" />
      <header className="mt-3 mb-6">
        <div className="text-sm text-muted">
          {formatDate(cls.startsAt)} · {formatTime(cls.startsAt)} ·{" "}
          <Link href={`/classes/${id}`} className="text-accent hover:underline">
            {cls.title}
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">
          Post-class report — {customer.name}
        </h1>
        {existing && (
          <div className="text-xs text-muted mt-1">
            Generated {formatDate(existing.generatedAt)} · last edit{" "}
            {formatDate(existing.updatedAt)}
            {existing.publishedAt ? (
              <span className="ml-2 inline-block rounded px-2 py-0.5 bg-emerald-100 text-emerald-700 font-medium">
                Published
              </span>
            ) : (
              <span className="ml-2 inline-block rounded px-2 py-0.5 bg-zinc-200 text-zinc-700 font-medium">
                Draft
              </span>
            )}
          </div>
        )}
      </header>

      {!existing ? (
        <form action={generate} className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-sm text-muted mb-4">
            No report yet. Generate one using {customer.name}&apos;s performance data from this class.
          </p>
          <button
            type="submit"
            className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium"
          >
            Generate report with AI
          </button>
        </form>
      ) : edit ? (
        <form action={save} className="bg-card border border-border rounded-xl p-5">
          <textarea
            name="content"
            defaultValue={existing.contentMarkdown}
            rows={26}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
          />
          <div className="flex items-center justify-between mt-3">
            <Link
              href={`/classes/${id}/reports/${customerId}`}
              className="text-xs text-muted hover:underline"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium"
            >
              Save edits
            </button>
          </div>
        </form>
      ) : (
        <>
          <article className="bg-card border border-border rounded-xl p-6">
            <Markdown>{existing.contentMarkdown}</Markdown>
          </article>
          <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
            <Link
              href={`/classes/${id}/reports/${customerId}?edit=1`}
              className="rounded-lg border border-border px-3 py-2 text-xs"
            >
              Edit
            </Link>
            <form action={generate}>
              <ConfirmSubmit
                message="Regenerate this report from scratch? Your edits will be replaced and the published status reset."
                className="rounded-lg border border-border px-3 py-2 text-xs"
              >
                Regenerate
              </ConfirmSubmit>
            </form>
            {existing.publishedAt ? (
              <form action={unpublish}>
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-2 text-xs"
                >
                  Unpublish
                </button>
              </form>
            ) : (
              <form action={publish}>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-medium"
                >
                  Publish to athlete
                </button>
              </form>
            )}
            <form action={deleteReport}>
              <ConfirmSubmit
                message={`Delete the report for ${customer.name}? This cannot be undone.`}
                className="text-xs text-muted hover:text-red-600 px-2"
              >
                Delete
              </ConfirmSubmit>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
