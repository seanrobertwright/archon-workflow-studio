import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import { ApiClientProvider, ThemeProvider, useThemeStore } from '@archon-studio/core';
import { ArchonApiClient } from '@archon-studio/api-archon';
import { useConnectionStore } from './connection-store';
import { ConnectPage } from './routes/ConnectPage';
import { WorkflowListPage } from './routes/WorkflowListPage';
import { BuilderPage } from './routes/BuilderPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Hydrates stores once; wraps all routes in ThemeProvider. */
function AppShell() {
  useEffect(() => {
    useThemeStore.getState().hydrate();
    useConnectionStore.getState().hydrate();
  }, []);
  const preset = useThemeStore((s) => s.preset);
  return (
    <ThemeProvider preset={preset}>
      <Outlet />
    </ThemeProvider>
  );
}

/**
 * Guards routes that require a valid connection.
 * Redirects to /connect if connection settings are absent.
 * Provides ApiClientProvider with a memoised ArchonApiClient.
 */
function RequireConnection() {
  const settings = useConnectionStore((s) => s.settings);

  const client = useMemo(() => {
    if (!settings) return null;
    return new ArchonApiClient({
      baseUrl: settings.archonUrl,
      authHeader: settings.token || undefined,
    });
  }, [settings?.archonUrl, settings?.token]);

  if (!settings || !client) return <Navigate to="/connect" replace />;

  return (
    <ApiClientProvider client={client}>
      <Outlet />
    </ApiClientProvider>
  );
}

/**
 * Root route: smart redirect based on whether connection settings exist.
 * Navigates to /workflows if connected, /connect if not.
 */
function HomeRedirect() {
  const settings = useConnectionStore((s) => s.settings);
  return <Navigate to={settings ? '/workflows' : '/connect'} replace />;
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/connect', element: <ConnectPage /> },
      {
        element: <RequireConnection />,
        children: [
          { path: '/workflows', element: <WorkflowListPage /> },
          { path: '/builder/:name', element: <BuilderPage /> },
        ],
      },
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
