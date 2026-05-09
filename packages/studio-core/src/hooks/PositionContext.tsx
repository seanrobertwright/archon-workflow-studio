import { createContext, useContext, type ReactNode } from 'react';
import type { UsePositionPersistence } from './usePositionPersistence';

const PositionContext = createContext<UsePositionPersistence | null>(null);

export function PositionProvider({
  value,
  children,
}: {
  value: UsePositionPersistence;
  children: ReactNode;
}) {
  return <PositionContext.Provider value={value}>{children}</PositionContext.Provider>;
}

export function usePositionContext(): UsePositionPersistence {
  const ctx = useContext(PositionContext);
  if (!ctx) {
    throw new Error(
      'usePositionContext: missing <PositionProvider>. Wrap descendants of WorkflowBuilder.',
    );
  }
  return ctx;
}
