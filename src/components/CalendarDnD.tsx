"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Must match HOUR_PX in the calendar grid.
const HOUR_PX = 52;

/**
 * Apple-style drag-to-reschedule layer for the week calendar. The calendar is
 * server-rendered; this mounts once and wires native drag-and-drop via event
 * delegation: drag an item with [data-drag-id] onto a day with [data-drop-day]
 * (a time column also carries [data-start-hour] so classes can land on a time).
 * On drop it PATCHes the new schedule and refreshes.
 */
export default function CalendarDnD() {
  const router = useRouter();
  useEffect(() => {
    let drag: { type: string; id: string; el: HTMLElement } | null = null;

    const onDragStart = (e: DragEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-drag-id]") as HTMLElement | null;
      if (!el || !el.draggable) return;
      drag = { type: el.dataset.dragType || "", id: el.dataset.dragId || "", el };
      try {
        e.dataTransfer?.setData("text/plain", drag.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      } catch {}
      el.style.opacity = "0.4";
    };

    const onDragEnd = () => {
      if (drag) drag.el.style.opacity = "";
      drag = null;
    };

    const onDragOver = (e: DragEvent) => {
      if (!drag) return;
      if ((e.target as HTMLElement)?.closest?.("[data-drop-day]")) e.preventDefault();
    };

    const onDrop = async (e: DragEvent) => {
      if (!drag) return;
      const drop = (e.target as HTMLElement)?.closest?.("[data-drop-day]") as HTMLElement | null;
      const current = drag;
      onDragEnd();
      if (!drop) return;
      e.preventDefault();
      const date = drop.dataset.dropDay;
      if (!date) return;
      const payload: { type: string; id: string; date: string; time?: string } = { type: current.type, id: current.id, date };
      // A class dropped onto a time column gets a time from the drop position.
      if (current.type === "class" && drop.dataset.startHour) {
        const rect = drop.getBoundingClientRect();
        const startHour = Number(drop.dataset.startHour);
        let min = startHour * 60 + ((e.clientY - rect.top) / HOUR_PX) * 60;
        min = Math.max(0, Math.min(24 * 60 - 15, Math.round(min / 15) * 15));
        payload.time = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      }
      try {
        const res = await fetch("/api/calendar/reschedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) router.refresh();
      } catch {}
    };

    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragend", onDragEnd);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [router]);

  return null;
}
