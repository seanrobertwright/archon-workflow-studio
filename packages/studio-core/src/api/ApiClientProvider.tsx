import { createContext, useContext, type ReactNode } from 'react';
import type { WorkflowApiClient } from './WorkflowApiClient';

const ApiClientContext = createContext<WorkflowApiClient | null>(null);

export function ApiClientProvider({
  client,
  children,
}: {
  client: WorkflowApiClient;
  children: ReactNode;
}) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useWorkflowApi(): WorkflowApiClient {
  const ctx = useContext(ApiClientContext);
  if (!ctx) throw new Error('useWorkflowApi must be used inside <ApiClientProvider>');
  return ctx;
}
