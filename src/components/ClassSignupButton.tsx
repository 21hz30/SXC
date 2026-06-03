"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";

/**
 * Quick sign-up / drop toggle for a class, usable on any class list (camp
 * schedule, calendar) without opening the class detail. Confirms before acting
 * and flips its own label immediately from the server's response, so it doesn't
 * depend on the parent re-rendering.
 */
export default function ClassSignupButton({
  classId,
  signedUp: initialSignedUp,
  isFull,
  size = "sm",
}: {
  classId: string;
  signedUp: boolean;
  isFull: boolean;
  size?: "sm" | "xs";
}) {
  const router = useRouter();
  const [signedUp, setSignedUp] = useState(initialSignedUp);
  const [busy, setBusy] = useState(false);

  // Keep in sync if the parent feeds a new value (e.g. after navigation).
  useEffect(() => setSignedUp(initialSignedUp), [initialSignedUp]);

  async function toggle(e: React.MouseEvent) {
    // Don't let a surrounding link/card capture the click.
    e.preventDefault();
    e.stopPropagation();
    const msg = signedUp ? "Drop this class?" : "Sign up for this class?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/class/${classId}/signup`, { method: signedUp ? "DELETE" : "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSignedUp(!!body.signedUp);
      } else {
        window.alert(body.message === "class full" ? "Sorry, this class is now full." : "Could not update sign-up.");
      }
    } finally {
      setBusy(false);
      // Refresh so spot counts elsewhere update too.
      router.refresh();
    }
  }

  const pad = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  const disabled = busy || (!signedUp && isFull);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-1 rounded-lg font-medium transition shrink-0",
        pad,
        signedUp
          ? "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
          : isFull
            ? "border border-border text-muted cursor-not-allowed"
            : "bg-foreground text-white hover:opacity-90",
        busy ? "opacity-60" : "",
      ].join(" ")}
      title={signedUp ? "You're signed up — click to drop" : isFull ? "Class is full" : "Sign up for this class"}
    >
      {busy ? (
        "…"
      ) : signedUp ? (
        <><Check size={12} /> Signed up</>
      ) : isFull ? (
        "Full"
      ) : (
        <><Plus size={12} /> Sign up</>
      )}
    </button>
  );
}
