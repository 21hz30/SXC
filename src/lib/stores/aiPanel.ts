import { create } from "zustand";

/**
 * Open/close state for the right-hand AI chat panel, shared between the panel
 * itself (AiSidebar) and the main content area (MainShell), which shrinks to
 * make room when the panel is open and expands back when it closes.
 */
type AiPanelState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useAiPanel = create<AiPanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
