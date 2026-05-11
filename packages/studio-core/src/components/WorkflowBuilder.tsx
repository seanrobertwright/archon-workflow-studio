import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { ApiClientProvider } from '../api/ApiClientProvider';
import { ThemeProvider, type ThemePreset } from '../theme/ThemeProvider';
import type { WorkflowApiClient } from '../api/WorkflowApiClient';
import { useBuilderStore } from '../store/builder-store';
import { usePositionPersistence } from '../hooks/usePositionPersistence';
import { PositionProvider } from '../hooks/PositionContext';
import { Canvas } from './Canvas';
import { NodeLibrary } from './NodeLibrary';
import { NodeInspector } from './inspector/NodeInspector';
import { Toolbar } from './Toolbar';
import { StudioErrorBoundary } from './StudioErrorBoundary';
import { ValidationPanel } from './ValidationPanel';
import { useValidation } from '../validation/useValidation';
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

/**
 * Inner component — rendered inside all providers (ApiClientProvider, ThemeProvider, etc.)
 * so hooks like useValidation() (which calls useWorkflowApi()) are safe to call here.
 */
function WorkflowBuilderInner({
  cwd,
  workflowName,
  positions,
}: {
  cwd: string;
  workflowName: string;
  positions: ReturnType<typeof usePositionPersistence>;
}) {
  const storeName = useBuilderStore((s) => s.workflow?.name ?? workflowName);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const { issues, isValidating, focusIssue } = useValidation();

  return (
    <div className={styles.shell} data-drawer={drawerExpanded ? 'expanded' : 'collapsed'}>
      <div className={styles.toolbar}>
        <Toolbar workflowName={storeName} onResetLayout={positions.reset} />
      </div>
      <div className={styles.library}>
        <NodeLibrary cwd={cwd} />
      </div>
      <main className={styles.canvas}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </main>
      <div className={styles.inspector}>
        <NodeInspector />
      </div>
      <section className={styles.drawer} data-testid="validation-drawer">
        <ValidationPanel
          issues={issues}
          expanded={drawerExpanded}
          onToggle={setDrawerExpanded}
          onFocusIssue={focusIssue}
          isValidating={isValidating}
        />
      </section>
    </div>
  );
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

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={client}>
        <ThemeProvider preset={theme}>
          <StudioErrorBoundary>
            <PositionProvider value={positions}>
              <WorkflowBuilderInner cwd={cwd} workflowName={workflowName} positions={positions} />
            </PositionProvider>
          </StudioErrorBoundary>
        </ThemeProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
