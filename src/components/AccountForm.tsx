import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

const ERR: Record<string, string> = {
  name: "Please enter a name.",
  phone: "That phone number is already used by someone else.",
  dupename: "Someone with this name already exists. Add a phone, email, or tag to tell them apart.",
  username: "Login name must be 3+ characters, English letters and numbers only.",
  weak: "Password must be at least 8 characters and include a letter and a number.",
  dupuser: "That login name is already taken — pick another.",
  duplicate: "That login name is already taken — pick another.",
  missing: "Please fill in the required fields.",
};

/**
 * Shared "add a person" form — identical layout for customers and admin/coach.
 * The only difference is the role: pass `showRole` to reveal an admin/coach
 * selector. Everyone is an athlete, so both get the same profile fields + a
 * login account.
 */
export default function AccountForm({
  action,
  error,
  showRole = false,
  submitLabel = "Create",
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  showRole?: boolean;
  submitLabel?: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-2 gap-4">
      {error && (
        <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {ERR[error] ?? "Please check the form and try again."}
        </div>
      )}

      <div className="col-span-2">
        <label className="block text-sm font-medium mb-1.5">Name *</label>
        <input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
      </div>

      <div className="col-span-2 grid grid-cols-2 gap-4 rounded-lg bg-background border border-border p-3">
        <div className="col-span-2 text-xs font-medium text-muted uppercase tracking-wide">Login account</div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Login name *</label>
          <input name="username" required placeholder="letters & numbers, e.g. janedoe" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Password *</label>
          <PasswordInput name="password" autoComplete="new-password" required />
        </div>
        {showRole && (
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Role</label>
            <select name="role" defaultValue="coach" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        )}
        <div className="col-span-2 text-[11px] text-muted">They sign in with this. At least 8 characters with a letter and a number.</div>
      </div>

      <div><label className="block text-sm font-medium mb-1.5">Email</label><input name="email" type="email" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
      <div><label className="block text-sm font-medium mb-1.5">Phone</label><input name="phone" placeholder="Used to keep people unique" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
      <div><label className="block text-sm font-medium mb-1.5">Age</label><input name="age" type="number" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
      <div><label className="block text-sm font-medium mb-1.5">Weight (kg)</label><input name="weightKg" type="number" step="0.1" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
      <div><label className="block text-sm font-medium mb-1.5">Height (cm)</label><input name="heightCm" type="number" step="0.1" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
      <div><label className="block text-sm font-medium mb-1.5">Tags (comma-separated)</label><input name="tags" placeholder="competing,Oct" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>

      <div className="col-span-2 flex gap-2 justify-end">
        <Link href={cancelHref} className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
        <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">{submitLabel}</button>
      </div>
    </form>
  );
}
