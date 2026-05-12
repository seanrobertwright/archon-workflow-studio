import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { ApiClientProvider, ThemeProvider, useThemeStore } from '@archon-studio/core';
import { useConnectionStore } from './connection-store';
import { BrowserApiClient } from './browser-api-client';
import { WorkflowListPage } from './routes/WorkflowListPage';
import { BuilderPage } from './routes/BuilderPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const STANDALONE_SETTINGS = {
  archonUrl: 'browser://standalone',
  cwd: 'local',
  token: '',
} as const;

/**
 * Standalone shell: hydrates stores, ensures connection-store has placeholder
 * values so downstream pages can read settings without a real Archon backend.
 * Workflows are persisted in localStorage via {@link BrowserApiClient}.
 */
function AppShell() {
  useEffect(() => {
    useThemeStore.getState().hydrate();
    const conn = useConnectionStore.getState();
    conn.hydrate();
    if (!useConnectionStore.getState().settings) {
      conn.save({ ...STANDALONE_SETTINGS });
    }
  }, []);
  const preset = useThemeStore((s) => s.preset);
  const client = useMemo(() => new BrowserApiClient(), []);
  return (
    <ThemeProvider preset={preset}>
      <ApiClientProvider client={client}>
        <Outlet />
      </ApiClientProvider>
    </ThemeProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/workflows" replace /> },
      { path: '/workflows', element: <WorkflowListPage /> },
      { path: '/builder/:name', element: <BuilderPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
