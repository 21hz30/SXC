import { redirect } from "next/navigation";
import Link from "next/link";
import { login, getSessionUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;

  async function doLogin(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const u = await login(username, password);
    if (u) redirect("/");
    redirect("/login?error=1");
  }

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <form action={doLogin} className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-3xl font-semibold tracking-tight">SXC</div>
          <div className="text-sm text-muted mt-1">Hyrox Coach Dashboard</div>
        </div>
        <label className="block text-sm font-medium mb-1.5">Username</label>
        <input
          name="username"
          autoFocus
          autoComplete="username"
          className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3"
        />
        <label className="block text-sm font-medium mb-1.5">Password</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-sm text-red-600">Wrong username or password.</p>}
        <button
          type="submit"
          className="mt-5 w-full rounded-lg bg-foreground text-white py-3 font-medium hover:opacity-90"
        >
          Sign in
        </button>
        <div className="mt-5 text-xs text-muted text-center">
          No account? <Link href="/register" className="text-accent hover:underline">Create one</Link>
        </div>
      </form>
    </main>
  );
}
