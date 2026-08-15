import { create } from "zustand";

interface UiState {
  moreSheetOpen: boolean;
  setMoreSheetOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  moreSheetOpen: false,
  setMoreSheetOpen: (moreSheetOpen) => set({ moreSheetOpen }),
}));
