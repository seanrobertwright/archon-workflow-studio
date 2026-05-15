import { describe, it, expect, afterEach, mock } from 'bun:test';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ConnectPage } from '../src/routes/ConnectPage';
import { useConnectionStore } from '../src/connection-store';

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ settings: null, pingStatus: null });
  try {
    globalThis.localStorage?.clear();
  } catch {
    // private mode — non-fatal
  }
});

function renderConnect() {
  return render(
    <MemoryRouter initialEntries={['/connect']}>
      <Routes>
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/workflows" element={<div data-testid="workflows-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConnectPage', () => {
  it('renders the form with default URL and Test Connection button', () => {
    renderConnect();
    const urlInput = screen.getByDisplayValue('http://localhost:3737');
    expect(urlInput).toBeTruthy();
    expect(screen.getByRole('button', { name: /test connection/i })).toBeTruthy();
  });

  it('shows "Could not reach Archon" when fetch rejects (network error)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    renderConnect();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/could not reach archon/i)).toBeTruthy();
    });
    globalThis.fetch = origFetch;
  });

  it('shows "Archon returned 500" when server responds with 5xx', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        ({
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => '',
        }) as Response,
    ) as unknown as typeof fetch;
    renderConnect();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/archon returned 500/i)).toBeTruthy();
    });
    globalThis.fetch = origFetch;
  });

  it('shows cwd text input after successful ping when listCodebases returns 404', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      if ((url as string).includes('/api/openapi.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ info: { version: '2.0.0' } }),
          text: async () => '',
        } as Response;
      }
      // /api/codebases → 404 (listCodebases returns null)
      return {
        ok: false,
        status: 404,
        json: async () => 'Not Found',
        text: async () => '',
      } as Response;
    }) as unknown as typeof fetch;

    renderConnect();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeTruthy();
    });
    expect(screen.getByPlaceholderText(/home\/user\/my-project/i)).toBeTruthy();
    globalThis.fetch = origFetch;
  });
});
