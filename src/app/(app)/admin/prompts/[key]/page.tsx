import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { flashUrl } from "@/lib/flash";
import { formatDateLong } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Markdown from "@/components/Markdown";
import {
  PROMPT_REGISTRY,
  getPromptForEdit,
  savePrompt,
  resetPrompt,
  type PromptKey,
} from "@/domain/prompts";

export const dynamic = "force-dynamic";

export default async function PromptEditor({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  await requireAdmin();

  const { key: rawKey } = await params;
  const { preview } = await searchParams;
  const key = decodeURIComponent(rawKey) as PromptKey;
  if (!(key in PROMPT_REGISTRY)) notFound();

  const prompt = await getPromptForEdit(key);

  async function save(formData: FormData) {
    "use server";
    const u = await requireAdmin();
    const content = String(formData.get("content") ?? "");
    if (!content.trim()) return;
    await savePrompt(key, content, u.id);
    revalidatePath(`/admin/prompts/${rawKey}`);
    revalidatePath(`/admin/prompts`);
    redirect(flashUrl(`/admin/prompts/${rawKey}`, "Prompt saved"));
  }

  async function reset() {
    "use server";
    await requireAdmin();
    await resetPrompt(key);
    revalidatePath(`/admin/prompts/${rawKey}`);
    revalidatePath(`/admin/prompts`);
    redirect(flashUrl(`/admin/prompts/${rawKey}`, "Reset to default"));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <BackButton fallback="/admin/prompts" label="All prompts" />
      <header className="mt-3 mb-5">
        <div className="text-xs text-muted">
          <code className="bg-black/5 px-1 rounded">{prompt.key}</code>
          {prompt.source === "file" ? (
            <span className="ml-2 inline-block rounded px-1.5 py-0.5 bg-zinc-200 text-zinc-700 font-medium">
              Default (from file)
            </span>
          ) : (
            <span className="ml-2 inline-block rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-medium">
              Edited {prompt.updatedAt ? formatDateLong(prompt.updatedAt) : ""}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">{prompt.name}</h1>
        <p className="text-sm text-muted mt-1">{prompt.description}</p>
      </header>

      <div className="flex items-center justify-end gap-3 mb-2 text-xs">
        <Link
          href={preview ? `/admin/prompts/${rawKey}` : `/admin/prompts/${rawKey}?preview=1`}
          className="text-muted hover:text-accent"
        >
          {preview ? "Hide preview" : "Show preview"}
        </Link>
      </div>

      <form action={save} className="bg-card border border-border rounded-xl p-5">
        <textarea
          name="content"
          defaultValue={prompt.content}
          rows={26}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between mt-3">
          {prompt.source === "db" ? (
            <form action={reset}>
              <ConfirmSubmit
                message="Reset this prompt back to the default that ships with the app? Your edits will be discarded."
                className="text-xs text-muted hover:text-red-600"
              >
                Reset to default
              </ConfirmSubmit>
            </form>
          ) : (
            <span className="text-xs text-muted">
              Saving will override the default file with your version.
            </span>
          )}
          <button
            type="submit"
            className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium"
          >
            Save
          </button>
        </div>
      </form>

      {preview && (
        <article className="mt-5 bg-card border border-border rounded-xl p-6">
          <div className="text-[11px] font-medium text-muted uppercase tracking-wide mb-2">
            Rendered preview
          </div>
          <Markdown>{prompt.content}</Markdown>
        </article>
      )}
    </div>
  );
}
