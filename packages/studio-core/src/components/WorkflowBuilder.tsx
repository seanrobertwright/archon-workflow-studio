import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ApiClientProvider } from '../api/ApiClientProvider';
import { ThemeProvider, type ThemePreset } from '../theme/ThemeProvider';
import type { WorkflowApiClient } from '../api/WorkflowApiClient';
import { useBuilderStore } from '../store/builder-store';
import { usePositionPersistence } from '../hooks/usePositionPersistence';
import { Canvas } from './Canvas';
import { NodeLibrary } from './NodeLibrary';
import { Toolbar } from './Toolbar';
import { StudioErrorBoundary } from './StudioErrorBoundary';
import styles from './WorkflowBuilder.module.css';

export interface WorkflowBuilderProps {
  client: WorkflowApiClient;
  theme: ThemePreset;
  /** Used to key persisted positions. In dev/standalone Phase 2, pass `__dev__`. */
  archonUrl: string;
  cwd: string;
  /** The current workflow's name — also used for position keying. */
  workflowName: string;
}

export function WorkflowBuilder({
  client,
  theme,
  archonUrl,
  cwd,
  workflowName,
}: WorkflowBuilderProps) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const positions = usePositionPersistence(archonUrl, cwd, workflowName);
  const storeName = useBuilderStore((s) => s.workflow?.name ?? workflowName);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={client}>
        <ThemeProvider preset={theme}>
          <StudioErrorBoundary>
            <div className={styles.shell}>
              <div className={styles.toolbar}>
                <Toolbar workflowName={storeName} onResetLayout={positions.reset} />
              </div>
              <div className={styles.library}>
                <NodeLibrary />
              </div>
              <main className={styles.canvas}>
                <ReactFlowProvider>
                  <Canvas positions={positions} />
                </ReactFlowProvider>
              </main>
              <aside className={styles.inspector} aria-label="Node inspector">
                {/* Phase 4 fills in NodeInspector */}
              </aside>
            </div>
          </StudioErrorBoundary>
        </ThemeProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
