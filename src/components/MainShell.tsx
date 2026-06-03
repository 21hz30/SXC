"use client";

import { useAiPanel } from "@/lib/stores/aiPanel";
import { cn } from "@/lib/utils";

/**
 * Wraps the page content. Reserves room on the right (xl+) for the AI chat
 * panel only while it's open, and animates the width change. Below xl the
 * panel overlays, so no padding is reserved.
 */
export default function MainShell({ children }: { children: React.ReactNode }) {
  const open = useAiPanel((s) => s.open);
  return (
    <main
      className={cn(
        "md:pl-60 min-h-screen transition-[padding] duration-300 ease-in-out",
        // Reserve room for the 24rem panel from lg+ (it's a side panel there);
        // below lg the panel overlays, so no padding is reserved.
        open && "lg:pr-96",
      )}
    >
      {children}
    </main>
  );
}
