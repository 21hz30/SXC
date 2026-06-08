"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Check } from "lucide-react";

/**
 * Fire a toast from any client component:  toast("Saved")
 * Server actions instead redirect via flashUrl(path, message) and this
 * component picks the message up from the `?flash=` query param.
 */
export function toast(message: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-toast", { detail: message }));
  }
}

type ToastItem = { id: number; message: string };
let counter = 0;

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const push = useCallback((message: string) => {
    if (!message) return;
    const id = ++counter;
    setItems((cur) => [...cur, { id, message }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4800);
  }, []);

  // Client-dispatched toasts.
  useEffect(() => {
    const handler = (e: Event) => push((e as CustomEvent<string>).detail);
    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, [push]);

  // Server-action flash messages arrive as ?flash=… — show then strip it.
  useEffect(() => {
    const flash = searchParams.get("flash");
    if (!flash) return;
    push(flash);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("flash");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:bottom-6 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-lg bg-foreground text-white px-4 py-2.5 text-sm shadow-xl ring-1 ring-black/10"
        >
          <Check size={15} className="text-emerald-400 shrink-0" />
          {t.message}
        </div>
      ))}
    </div>
  );
}
