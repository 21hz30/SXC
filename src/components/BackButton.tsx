"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * History-aware back button. If there's a history entry, uses router.back();
 * otherwise falls back to the provided href.
 */
export default function BackButton({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  function go() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }
  return (
    <button
      onClick={go}
      className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition"
    >
      <ChevronLeft size={16} /> {label}
    </button>
  );
}
