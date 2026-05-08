import { useEffect, type ReactNode } from 'react';

export type ThemePreset = 'archon-dark' | 'light' | 'high-contrast' | 'inherit';

export function ThemeProvider({ preset, children }: { preset: ThemePreset; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.studioTheme = preset;
    return () => {
      delete document.documentElement.dataset.studioTheme;
    };
  }, [preset]);
  return <>{children}</>;
}
