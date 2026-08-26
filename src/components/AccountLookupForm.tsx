"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CircleUserRound, Headphones, Phone, UserPlus } from "lucide-react";

type LookupResult =
  | { status: "found"; username: string }
  | { status: "not_found" }
  | { status: "unavailable"; username: string };

export default function AccountLookupForm() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function lookupAccount(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setResult(null);
    setShowContact(false);
    try {
      const response = await fetch("/api/auth/account-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setResult(data as LookupResult);
    } catch (error) {
      setMessage((error as Error).message || "Unable to look up the account right now.");
    } finally {
      setPending(false);
    }
  }

  function searchAgain() {
    setResult(null);
    setShowContact(false);
    setMessage(null);
  }

  const registerHref = `/register?phone=${encodeURIComponent(phone.trim())}`;

  return (
    <div className="w-full max-w-sm border border-border bg-card p-5 shadow-sm sm:rounded-2xl sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-accent">
          {result?.status === "found" ? <CircleUserRound size={20} /> : result?.status === "not_found" ? <UserPlus size={20} /> : <Phone size={20} />}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Find your account</h1>
          <p className="text-sm text-muted">Enter the phone number linked to your profile.</p>
        </div>
      </div>

      {!result && (
        <form onSubmit={lookupAccount}>
          <label className="mb-1.5 block text-sm font-medium">Phone number</label>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            required
            placeholder="e.g. 13800138000"
            className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent"
          />
          <button disabled={pending} type="submit" className="mt-5 w-full rounded-lg bg-foreground py-3 font-medium text-white hover:opacity-90 disabled:opacity-40">
            {pending ? "Looking up..." : "Find my account"}
          </button>
        </form>
      )}

      {result?.status === "found" && (
        <div>
          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <div className="text-xs text-muted">Your username</div>
            <div className="mt-1 break-all text-lg font-semibold" data-no-i18n>{result.username}</div>
          </div>
          <Link href={`/login?username=${encodeURIComponent(result.username)}`} className="mt-5 block w-full rounded-lg bg-foreground py-3 text-center font-medium text-white hover:opacity-90">
            Sign in with this username
          </Link>
          <button type="button" onClick={() => setShowContact(true)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm font-medium hover:bg-background">
            <Headphones size={16} /> Forgot password? Contact Peter
          </button>
        </div>
      )}

      {result?.status === "not_found" && (
        <div>
          <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted">
            No account was found for this phone number.
          </div>
          <Link href={registerHref} className="mt-5 block w-full rounded-lg bg-foreground py-3 text-center font-medium text-white hover:opacity-90">
            Create an account
          </Link>
        </div>
      )}

      {result?.status === "unavailable" && (
        <div>
          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <div className="text-xs text-muted">Account found</div>
            <div className="mt-1 break-all text-lg font-semibold" data-no-i18n>{result.username}</div>
            <p className="mt-2 text-sm text-muted">This account is currently unavailable. Contact Peter for help.</p>
          </div>
          <button type="button" onClick={() => setShowContact(true)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-3 font-medium text-white hover:opacity-90">
            <Headphones size={16} /> Contact Peter
          </button>
        </div>
      )}

      {showContact && (
        <div className="mt-4 rounded-lg border border-accent/30 bg-orange-50 px-4 py-3">
          <div className="text-sm font-medium">Contact administrator Peter</div>
          <p className="mt-1 text-sm text-muted">Send Peter the username shown above. Peter will verify your identity and reset the password.</p>
        </div>
      )}

      {message && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        {result ? (
          <button type="button" onClick={searchAgain} className="text-muted hover:text-foreground">Use another phone number</button>
        ) : (
          <Link href="/login" className="inline-flex items-center gap-1.5 text-muted hover:text-foreground"><ArrowLeft size={14} /> Back to sign in</Link>
        )}
        {result && <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>}
      </div>
    </div>
  );
}
