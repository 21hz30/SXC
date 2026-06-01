import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { hashPassword, getSessionUser, makeToken, SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import PasswordInput from "@/components/PasswordInput";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;

  async function doRegister(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim() || username;

    // Password rules: 8+ chars, at least one letter and one number.
    const passwordOk =
      password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
    if (!username || !passwordOk) redirect("/register?error=invalid");
    const exists = await db.user.findUnique({ where: { username } });
    if (exists) redirect("/register?error=taken");

    // Single-role model for now: every new account is an admin.
    const u = await db.user.create({
      data: { username, name, role: "admin", passwordHash: await hashPassword(password) },
    });
    // Auto-login the new account
    const jar = await cookies();
    jar.set(SESSION_COOKIE, makeToken(u.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/");
  }

  const errMsg = error === "taken"
    ? "That username is already taken."
    : error === "invalid"
    ? "Password must be at least 8 characters and include a letter and a number."
    : null;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <form action={doRegister} className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-3xl font-semibold tracking-tight">SXC</div>
          <div className="text-sm text-muted mt-1">Create your account</div>
        </div>

        <label className="block text-sm font-medium mb-1.5">Username</label>
        <input name="username" autoFocus autoComplete="username" required className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3" />

        <label className="block text-sm font-medium mb-1.5">Display name (optional)</label>
        <input name="name" autoComplete="name" className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3" />

        <label className="block text-sm font-medium mb-1.5">Password</label>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
          title="At least 8 characters, with one letter and one number."
        />
        <p className="mt-1.5 mb-3 text-xs text-muted leading-snug">
          At least 8 characters, mixing letters and numbers.<br />
          Tip: a short sentence plus a number is easy to remember and hard to guess.
        </p>

        {errMsg && <p className="mt-3 text-sm text-red-600">{errMsg}</p>}

        <button
          type="submit"
          className="mt-5 w-full rounded-lg bg-foreground text-white py-3 font-medium hover:opacity-90"
        >
          Create account
        </button>

        <div className="mt-5 text-xs text-muted text-center">
          Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
        </div>
      </form>
    </main>
  );
}
