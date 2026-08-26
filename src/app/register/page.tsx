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
  searchParams: Promise<{ error?: string; code?: string; phone?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const { error, code: codeParam, phone: phoneParam } = await searchParams;
  // A coach shares /register?code=SRC-TAY-XXXX — pre-fill (and keep) the code
  // so the athlete doesn't have to type it. Uppercased to match how codes are
  // minted and looked up.
  const presetCode = (codeParam ?? "").trim().toUpperCase();
  const presetPhone = (phoneParam ?? "").trim();

  async function doRegister(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim() || username;
    const phone = String(formData.get("phone") ?? "").trim();
    // A coach invitation only arrives as a deep-link (/register?code=…) now —
    // there's no code field on the lean sign-up form. Keep it across bounces.
    const code = presetCode;
    const continuation = new URLSearchParams();
    if (code) continuation.set("code", code);
    if (phone) continuation.set("phone", phone);
    const continuationQS = continuation.size ? `&${continuation.toString()}` : "";

    // Sign-up asks for the four essentials only: login name, display name,
    // phone, password. Email + coach connection are gathered later, in
    // onboarding, to keep this form short.

    // Username: this is the LOGIN name. English letters and numbers only —
    // no spaces or special characters — so it's safe and easy to type.
    if (!/^[a-z0-9]{3,}$/.test(username)) redirect(`/register?error=username${continuationQS}`);
    // Password rules: 8+ chars, at least one letter and one number.
    const passwordOk =
      password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
    if (!passwordOk) redirect(`/register?error=invalid${continuationQS}`);
    // Phone is required for every athlete (their coach needs a way to reach
    // them). Loose check — 6–20 digits once symbols are stripped — so CN mobiles
    // and international numbers both pass.
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 6 || phoneDigits.length > 20) redirect(`/register?error=phone${continuationQS}`);

    // Public sign-up creates an athlete (customer) account: a login + a linked
    // profile. Phone may "claim" a profile a coach already pre-made (handled in
    // createAccount). Staff accounts are created by an admin from the Team page.
    let userId: string;
    let customerId: string;
    try {
      const res = await createAccount({ username, password, name, phone, role: "customer" });
      userId = res.userId;
      customerId = res.customerId;
    } catch (e) {
      if (e instanceof AccountError) redirect(`/register?error=taken${continuationQS}`);
      throw e;
    }

    // Invited via a coach's deep-link? Request the connection — pending until the
    // coach approves it from their inbox (#31). A stale/invalid code is ignored
    // rather than blocking sign-up; athletes without a link connect later, in
    // onboarding or from their profile's "My coaches".
    if (code && (await findCoachByCode(code))) await connectByCode(customerId, code);

    // Auto-login, then land on the profile where onboarding pops up.
    const jar = await cookies();
    jar.set(SESSION_COOKIE, makeToken(userId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      priority: "high",
    });
    redirect("/profile");
  }

  const errMsg = error === "taken"
    ? "That username is already taken."
    : error === "username"
    ? "Username must be English letters and numbers only (at least 3, no spaces or symbols)."
    : error === "invalid"
    ? "Password must be at least 8 characters and include a letter and a number."
    : error === "phone"
    ? "Enter a valid phone number."
    : null;

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <form action={doRegister} className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src={srcLogo} alt="SRC by Peoplearth" width={112} height={112} priority />
          <div className="text-sm text-muted mt-2">Create your athlete account</div>
        </div>

        {presetCode && (
          <p className="mb-5 rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-muted leading-snug">
            You&apos;ve been invited by a coach — we&apos;ll send them your connection request right after you sign up.
          </p>
        )}

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
          Display name <span className="text-muted font-normal">· optional</span>
        </label>
        <input name="name" autoComplete="name" placeholder="e.g. Peter Zhang" className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3" />

        <label className="block text-sm font-medium mb-1.5">
          Phone <span className="text-accent font-semibold">· required</span>
        </label>
        <input
          name="phone"
          defaultValue={presetPhone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="e.g. 13800138000"
          className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3"
        />

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
