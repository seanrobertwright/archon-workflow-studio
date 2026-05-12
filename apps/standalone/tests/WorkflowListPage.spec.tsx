import { describe, it, expect, afterEach } from 'bun:test';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientProvider } from '@archon-studio/core';
import type { WorkflowApiClient } from '@archon-studio/core';
import { WorkflowListPage } from '../src/routes/WorkflowListPage';
import { useConnectionStore } from '../src/connection-store';

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ settings: null, pingStatus: null });
});

const SETTINGS = { archonUrl: 'http://localhost:3737', cwd: '/home/test', token: '' };

function makeClient(overrides: Partial<WorkflowApiClient> = {}): WorkflowApiClient {
  return {
    ping: async () => ({ ok: true }),
    listCodebases: async () => null,
    listWorkflows: async () => [],
    listCommands: async () => [],
    listProviders: async () => [],
    getWorkflow: async () => ({ name: 'w', description: '', nodes: [] }) as never,
    saveWorkflow: async (_n, _c, d) => d,
    deleteWorkflow: async () => undefined,
    validateWorkflow: async () => ({ valid: true }),
    ...overrides,
  };
}

function renderList(client: WorkflowApiClient) {
  useConnectionStore.setState({ settings: SETTINGS, pingStatus: 'ok' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApiClientProvider client={client}>
        <MemoryRouter initialEntries={['/workflows']}>
          <Routes>
            <Route path="/workflows" element={<WorkflowListPage />} />
            <Route path="/builder/:name" element={<div data-testid="builder" />} />
            <Route path="/connect" element={<div data-testid="connect" />} />
          </Routes>
        </MemoryRouter>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('WorkflowListPage', () => {
  it('shows loading state while query is pending', () => {
    const client = makeClient({
      listWorkflows: () => new Promise(() => {}),
    });
    renderList(client);
    expect(screen.getByText(/loading workflows/i)).toBeTruthy();
  });

  it('renders workflow names after successful load', async () => {
    const items = [
      { workflow: { name: 'classify', description: '', nodes: [] }, source: 'project' },
      { workflow: { name: 'summarise', description: '', nodes: [] }, source: 'global' },
    ] as never;
    const client = makeClient({ listWorkflows: async () => items });
    renderList(client);
    await waitFor(() => {
      expect(screen.getByText('classify')).toBeTruthy();
      expect(screen.getByText('summarise')).toBeTruthy();
    });
  });

  it('shows error message when listWorkflows rejects', async () => {
    const client = makeClient({
      listWorkflows: async () => {
        throw new Error('Connection refused');
      },
    });
    renderList(client);
    await waitFor(() => {
      expect(screen.getByText(/failed to load workflows/i)).toBeTruthy();
    });
  });
});
