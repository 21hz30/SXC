import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { login, getSessionUser } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";
import srcLogo from "@/assets/brand/src-logo.png";

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
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src={srcLogo} alt="SRC by Peoplearth" width={112} height={112} priority />
          <div className="text-sm text-muted mt-2">Hyrox Coach Dashboard</div>
        </div>
        <label className="block text-sm font-medium mb-1.5">Username</label>
        <input
          name="username"
          autoFocus
          autoComplete="username"
          className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3"
        />
        <label className="block text-sm font-medium mb-1.5">Password</label>
        <PasswordInput name="password" autoComplete="current-password" required />
        {error && (
          <p className="mt-2 text-sm text-red-600">
            That username and password don&apos;t match. Check your spelling, or{" "}
            <Link href="/register" className="underline">create an account</Link>.
          </p>
        )}
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
