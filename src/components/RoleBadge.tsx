import { Crown, Shield, User2 } from "lucide-react";

const ROLE_META: Record<string, { label: string; icon: typeof User2; cls: string }> = {
  admin: {
    label: "Admin",
    icon: Crown,
    // Violet — admin spans all tenants; visually distinct from coach.
    cls: "bg-violet-100 text-violet-800 border-violet-200",
  },
  coach: {
    label: "Coach",
    icon: Shield,
    cls: "bg-sky-100 text-sky-800 border-sky-200",
  },
  customer: {
    label: "Customer",
    icon: User2,
    cls: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
};

/**
 * Tiny pill that shows a User's role at a glance. Reused on the customers
 * list, the customer detail header, and anywhere else we need to call out
 * "this person is a coach, not an athlete." Pure presentation.
 */
export default function RoleBadge({
  role,
  size = "sm",
  className = "",
}: {
  role: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  const meta = ROLE_META[role] ?? ROLE_META.customer;
  const Icon = meta.icon;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  const iconSize = size === "xs" ? 9 : 11;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums ${meta.cls} ${pad} ${className}`}>
      <Icon size={iconSize} strokeWidth={2.2} />
      {meta.label}
    </span>
  );
}
