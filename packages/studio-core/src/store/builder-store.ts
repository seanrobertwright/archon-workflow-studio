import { create } from 'zustand';

interface BuilderState {
  // Phase 1 will populate workflow / selection / history / ui slices.
  ready: boolean;
}

export const useBuilderStore = create<BuilderState>(() => ({
  ready: false,
}));
