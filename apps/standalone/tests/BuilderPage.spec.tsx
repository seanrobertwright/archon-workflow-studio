import { describe, it, expect, afterEach } from 'bun:test';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientProvider } from '@archon-studio/core';
import type { WorkflowApiClient } from '@archon-studio/core';
import { BuilderPage } from '../src/routes/BuilderPage';
import { useConnectionStore } from '../src/connection-store';
import { useBuilderStore } from '@archon-studio/core';

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ settings: null, pingStatus: null });
  useBuilderStore.getState().clearWorkflow();
});

const SETTINGS = { archonUrl: 'http://localhost:3737', cwd: '/home/test', token: '' };

function makeClient(overrides: Partial<WorkflowApiClient> = {}): WorkflowApiClient {
  return {
    ping: async () => ({ ok: true }),
    listCodebases: async () => null,
    listWorkflows: async () => [],
    listCommands: async () => [],
    listProviders: async () => [],
    getWorkflow: async () => ({ name: 'classify', description: '', nodes: [] }) as never,
    saveWorkflow: async (_n, _c, d) => d,
    deleteWorkflow: async () => undefined,
    validateWorkflow: async () => ({ valid: true }),
    ...overrides,
  };
}

function renderBuilder(client: WorkflowApiClient, name = 'classify') {
  useConnectionStore.setState({ settings: SETTINGS, pingStatus: 'ok' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApiClientProvider client={client}>
        <MemoryRouter initialEntries={[`/builder/${name}`]}>
          <Routes>
            <Route path="/builder/:name" element={<BuilderPage />} />
            <Route path="/workflows" element={<div data-testid="workflows" />} />
          </Routes>
        </MemoryRouter>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('BuilderPage', () => {
  it('shows loading state while getWorkflow is pending', () => {
    const client = makeClient({
      getWorkflow: () => new Promise(() => {}),
    });
    renderBuilder(client);
    expect(screen.getByText(/loading classify/i)).toBeTruthy();
  });

  it('shows error banner when getWorkflow rejects', async () => {
    const client = makeClient({
      getWorkflow: async () => {
        throw new Error('Not found');
      },
    });
    renderBuilder(client);
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeTruthy();
    });
  });
});
