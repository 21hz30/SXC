"use client";

import { useState } from "react";
import { Phone } from "lucide-react";

/**
 * "Add your phone" gate. Shown (from the app layout) to any athlete whose
 * profile has no phone number yet — phone is now required for everyone. No skip:
 * they enter a number, we save it, and a full reload clears the modal (the
 * reload also dodges iOS WeChat's RSC cache, like the other log forms).
 */
export default function PhoneModal() {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    // Mirror the server bound (6–20 digits) so an over-long paste fails here with
    // guidance instead of bouncing off a 400 — this modal has no skip.
    if (digits.length < 6 || digits.length > 20) {
      setError("Enter a valid phone number.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/me/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Couldn't save — please try again.");
      }
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <Phone size={18} className="text-orange-600 shrink-0" />
          <h2 className="text-lg font-semibold">Add your phone number</h2>
        </div>
        <p className="text-sm text-muted mb-4 leading-snug">
          We need a contact number on your profile so your coach can reach you. It only takes a second.
        </p>
        <form onSubmit={save}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            placeholder="e.g. 13800138000"
            className="w-full rounded-lg border border-border bg-white px-3 py-3 text-base outline-none focus:border-accent mb-3"
          />
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-foreground text-white py-3 font-medium hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save my number"}
          </button>
        </form>
      </div>
    </div>
  );
}
