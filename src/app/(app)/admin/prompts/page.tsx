import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listPrompts } from "@/domain/prompts";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PromptsIndex() {
  const user = await requireUser();
  if (user.role === "customer") redirect("/me");

  const prompts = await listPrompts();

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">AI Prompts</h1>
        <p className="text-sm text-muted mt-1">
          Edit the system prompts that drive the chat assistant and the post-class
          report. Changes take effect on the next call.
        </p>
      </header>

      <ul className="divide-y divide-border bg-card border border-border rounded-xl">
        {prompts.map((p) => (
          <li key={p.key}>
            <Link
              href={`/admin/prompts/${encodeURIComponent(p.key)}`}
              className="block px-5 py-4 hover:bg-zinc-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted mt-0.5">{p.description}</div>
                  <div className="text-[11px] text-muted mt-1">
                    <code className="bg-black/5 px-1 rounded">{p.key}</code>
                    {p.source === "file" ? (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 bg-zinc-200 text-zinc-700 font-medium">
                        Default (from file)
                      </span>
                    ) : (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-medium">
                        Edited {p.updatedAt ? formatDate(p.updatedAt) : ""}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-accent shrink-0">Edit →</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
