import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ArchonApiClient } from '@archon-studio/api-archon';
import { ArchonHttpError } from '@archon-studio/api-archon';
import type { CodebaseInfo } from '@archon-studio/core';
import { useConnectionStore } from '../connection-store';

type Step = 'form' | 'testing' | 'cwd' | 'done';

export function ConnectPage() {
  const navigate = useNavigate();
  const saveConnection = useConnectionStore((s) => s.save);

  const [archonUrl, setArchonUrl] = useState('http://localhost:3737');
  const [cwd, setCwd] = useState('');
  const [token, setToken] = useState('');
  const [codebases, setCodebases] = useState<CodebaseInfo[] | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string | undefined>();

  const handleTest = useCallback(async () => {
    setError(null);
    setStep('testing');
    try {
      const tempClient = new ArchonApiClient({
        baseUrl: archonUrl,
        authHeader: token || undefined,
      });
      const pingResult = await tempClient.ping();
      setServerVersion(pingResult.serverVersion);
      // Progressive enhancement: probe for codebase dropdown
      const cb = await tempClient.listCodebases();
      setCodebases(cb);
      setStep('cwd');
    } catch (err) {
      const msg =
        err instanceof ArchonHttpError
          ? `Archon returned ${err.status}. Check the URL and auth token.`
          : `Could not reach Archon at ${archonUrl}. Is it running?`;
      setError(msg);
      setStep('form');
    }
  }, [archonUrl, token]);

  const handleConnect = useCallback(() => {
    saveConnection({ archonUrl, cwd, token });
    navigate('/workflows');
  }, [archonUrl, cwd, token, saveConnection, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--studio-bg)',
      }}
    >
      <div
        style={{
          width: 400,
          padding: 32,
          background: 'var(--studio-surface)',
          borderRadius: 8,
          border: '1px solid var(--studio-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, color: 'var(--studio-fg)' }}>Connect to Archon</h1>

        {/* Archon URL */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--studio-fg-muted)' }}>Archon URL</span>
          <input
            type="url"
            value={archonUrl}
            onChange={(e) => setArchonUrl(e.target.value)}
            disabled={step !== 'form'}
            placeholder="http://localhost:3737"
            style={{
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid var(--studio-border)',
              background: 'var(--studio-input-bg)',
              color: 'var(--studio-fg)',
              fontSize: 14,
            }}
          />
        </label>

        {/* Auth token (optional) */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--studio-fg-muted)' }}>
            Auth token <span style={{ opacity: 0.6 }}>(optional)</span>
          </span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={step !== 'form'}
            placeholder="Bearer ..."
            style={{
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid var(--studio-border)',
              background: 'var(--studio-input-bg)',
              color: 'var(--studio-fg)',
              fontSize: 14,
            }}
          />
        </label>

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--studio-error-bg, #3a1a1a)',
              color: 'var(--studio-error-fg, #ff6b6b)',
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Test Connection button */}
        {step === 'form' && (
          <button
            onClick={handleTest}
            style={{
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              background: 'var(--studio-accent)',
              color: '#fff',
              border: 'none',
              fontSize: 14,
            }}
          >
            Test Connection
          </button>
        )}

        {step === 'testing' && (
          <p style={{ fontSize: 13, color: 'var(--studio-fg-muted)', margin: 0 }}>Connecting…</p>
        )}

        {/* Step 2: cwd input / dropdown */}
        {(step === 'cwd' || step === 'done') && (
          <>
            <p style={{ fontSize: 13, color: 'var(--studio-fg-muted)', margin: 0 }}>
              ✓ Connected{serverVersion ? ` to Archon ${serverVersion}` : ''}
            </p>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--studio-fg-muted)' }}>
                Working directory
              </span>
              {codebases && codebases.length > 0 ? (
                /* Progressive enhancement: dropdown */
                <select
                  value={cwd}
                  onChange={(e) => {
                    const selected = codebases.find((cb) => cb.default_cwd === e.target.value);
                    setCwd(selected?.default_cwd ?? e.target.value);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid var(--studio-border)',
                    background: 'var(--studio-input-bg)',
                    color: 'var(--studio-fg)',
                    fontSize: 14,
                  }}
                >
                  <option value="">Select a project…</option>
                  {codebases.map((cb) => (
                    <option key={cb.id} value={cb.default_cwd}>
                      {cb.name} ({cb.default_cwd})
                    </option>
                  ))}
                </select>
              ) : (
                /* Fallback: manual text input */
                <input
                  type="text"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="/home/user/my-project"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid var(--studio-border)',
                    background: 'var(--studio-input-bg)',
                    color: 'var(--studio-fg)',
                    fontSize: 14,
                  }}
                />
              )}
            </label>

            <button
              onClick={handleConnect}
              disabled={!cwd.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 4,
                cursor: cwd.trim() ? 'pointer' : 'not-allowed',
                background: cwd.trim() ? 'var(--studio-accent)' : 'var(--studio-border)',
                color: '#fff',
                border: 'none',
                fontSize: 14,
              }}
            >
              Open workflows
            </button>
          </>
        )}
      </div>
    </div>
  );
}
