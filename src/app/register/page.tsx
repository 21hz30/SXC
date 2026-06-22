import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { getSessionUser, makeToken, SESSION_COOKIE } from "@/lib/auth";
import { createAccount, AccountError } from "@/domain/accounts";
import { findCoachByCode, connectByCode } from "@/domain/coachConnections";
import PasswordInput from "@/components/PasswordInput";
import srcLogo from "@/assets/brand/src-logo.png";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error, code: codeParam } = await searchParams;
  // A coach shares /register?code=SRC-TAY-XXXX — pre-fill (and keep) the code
  // so the athlete doesn't have to type it. Uppercased to match how codes are
  // minted and looked up.
  const presetCode = (codeParam ?? "").trim().toUpperCase();

  async function doRegister(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim() || username;
    const email = String(formData.get("email") ?? "").trim() || null;
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    // Preserve the entered code across validation bounces so it isn't lost.
    const codeQS = code ? `&code=${encodeURIComponent(code)}` : "";

    // Username: this is the LOGIN name. English letters and numbers only —
    // no spaces or special characters — so it's safe and easy to type.
    if (!/^[a-z0-9]{3,}$/.test(username)) redirect(`/register?error=username${codeQS}`);
    // Password rules: 8+ chars, at least one letter and one number.
    const passwordOk =
      password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
    if (!passwordOk) redirect(`/register?error=invalid${codeQS}`);

    // The coach code is OPTIONAL. An athlete can join with no coach — they can
    // still browse and sign up for drop-in classes, and add a coach later from
    // their profile. But IF they typed a code, it must be valid (so a typo
    // doesn't silently create a coachless account they didn't intend). Checked
    // before account creation so a bad code never leaves an orphan login behind.
    if (code && !(await findCoachByCode(code))) redirect(`/register?error=badcode${codeQS}`);

    // Public sign-up creates an athlete (customer) account: a login + a linked
    // profile. Staff accounts are created by an admin from the Team page.
    let userId: string;
    let customerId: string;
    try {
      const res = await createAccount({ username, password, name, email, role: "customer" });
      userId = res.userId;
      customerId = res.customerId;
    } catch (e) {
      if (e instanceof AccountError) redirect(`/register?error=taken${codeQS}`);
      throw e;
    }

    // If they supplied a (valid) code, request the connection — pending until
    // the coach approves it from their dashboard inbox (#31). No code → skip,
    // and they start as a free drop-in athlete.
    if (code) await connectByCode(customerId, code);

    // Auto-login, then land on the profile where onboarding pops up.
    const jar = await cookies();
    jar.set(SESSION_COOKIE, makeToken(userId), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/profile");
  }

  const errMsg = error === "taken"
    ? "That username is already taken."
    : error === "username"
    ? "Username must be English letters and numbers only (at least 3, no spaces or symbols)."
    : error === "invalid"
    ? "Password must be at least 8 characters and include a letter and a number."
    : error === "badcode"
    ? "That invitation code didn't match any coach. Leave it blank to join without a coach, or double-check the code."
    : null;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <form action={doRegister} className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src={srcLogo} alt="SRC by Peoplearth" width={112} height={112} priority />
          <div className="text-sm text-muted mt-2">Create your athlete account</div>
        </div>

        <label className="block text-sm font-medium mb-1.5">
          Coach invitation code <span className="text-muted font-normal">· optional</span>
        </label>
        <input
          name="code"
          defaultValue={presetCode}
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. SRC-TAY-9X3K"
          className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base font-mono tracking-wider uppercase outline-none focus:border-accent"
        />
        <p className="mt-1.5 mb-3 text-xs text-muted leading-snug">
          Have a code from your coach? Enter it to connect (they&apos;ll approve you). No code? You can still sign up for drop-in classes and add a coach later.
        </p>

        <label className="block text-sm font-medium mb-1.5">
          Username <span className="text-accent font-semibold">· your login name</span>
        </label>
        <input
          name="username"
          autoFocus
          autoComplete="username"
          required
          pattern="[A-Za-z0-9]{3,}"
          minLength={3}
          title="English letters and numbers only — no spaces or special characters."
          placeholder="e.g. mayarod"
          className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent"
        />
        <p className="mt-1.5 mb-3 text-xs text-muted leading-snug">
          What you&apos;ll sign in with. English letters and numbers only — no spaces or special characters.
        </p>

        <label className="block text-sm font-medium mb-1.5">
          Full name <span className="text-muted font-normal">· your real name</span>
        </label>
        <input name="name" autoComplete="name" placeholder="e.g. Maya Rodríguez" className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3" />

        <label className="block text-sm font-medium mb-1.5">Email <span className="text-muted font-normal">(so your coach can link your profile)</span></label>
        <input name="email" type="email" autoComplete="email" className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3" />

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
