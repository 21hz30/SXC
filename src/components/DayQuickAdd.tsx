"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, CalendarPlus, CheckSquare, StickyNote } from "lucide-react";

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

const TYPES = [
  { type: "class", label: "Class", icon: CalendarPlus, hint: "Scheduled session" },
  { type: "todo", label: "To-do", icon: CheckSquare, hint: "Task with a checkbox" },
  { type: "note", label: "Note", icon: StickyNote, hint: "A reminder for the day" },
] as const;

export default function DayQuickAdd({ date, returnTo, variant = "icon", label = "Add", align = "left" }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(type: string) {
    setOpen(false);
    const params = new URLSearchParams({ type, date, return: returnTo });
    router.push(`/calendar/new?${params.toString()}`);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Add to this day"
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
      </button>

      {open && (
        <div className={`absolute z-30 mt-1 ${align === "right" ? "right-0" : "left-0"} w-44 rounded-lg border border-border bg-white shadow-lg py-1`}>
          {TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => go(t.type)}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-background"
            >
              <t.icon size={14} className="mt-0.5 shrink-0 text-accent" />
              <span className="leading-tight">
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-[11px] text-muted">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
