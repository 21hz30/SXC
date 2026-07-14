import Link from "next/link";
import { Plus } from "lucide-react";

type Props = {
  /** ISO date (YYYY-MM-DD) the new item is attached to. */
  date: string;
  /** Where to return after creating. */
  returnTo: string;
  /** Visual style of the trigger. */
  variant?: "icon" | "text" | "button";
  label?: string;
  /** Open the menu to the right edge instead of the left. */
  align?: "left" | "right";
};

export default function DayQuickAdd({ date, returnTo, variant = "icon", label = "Add", align = "left" }: Props) {
  const params = new URLSearchParams({ date, return: returnTo });
  const side = align === "right" ? "justify-end" : "justify-start";

  return (
    <span className={`inline-flex ${side}`}>
      <Link
        href={`/calendar/new?${params.toString()}`}
        title="Add class to this day"
        className={
          variant === "icon"
            ? "rounded p-0.5 text-muted hover:text-foreground hover:bg-background"
            : variant === "button"
            ? "inline-flex items-center gap-1.5 rounded-lg bg-foreground text-white px-3 py-2 text-sm font-medium hover:opacity-90"
            : "inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
        }
      >
        <Plus size={variant === "icon" ? 12 : variant === "button" ? 16 : 13} />
        {variant !== "icon" && <span>{label}</span>}
      </Link>
    </span>
  );
}
