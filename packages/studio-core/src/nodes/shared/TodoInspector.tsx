import type { FC } from 'react';
import type { InspectorProps } from './types';

/**
 * Phase-4 placeholder Inspector. Each per-variant `index.ts` registers this
 * (parameterised with the variant id label) until Tasks 56–59 replace it with
 * the real General-tab content. Lets typecheck stay green between tasks.
 *
 * Removed in Task 56 (per-variant General sub-Inspectors land then).
 */
export function makeTodoInspector<TData>(variantLabel: string): FC<InspectorProps<TData>> {
  const TodoInspector: FC<InspectorProps<TData>> = () => (
    <div data-testid="inspector-todo" style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
      Inspector for <strong>{variantLabel}</strong> pending Phase 4 wire-up.
    </div>
  );
  TodoInspector.displayName = `TodoInspector(${variantLabel})`;
  return TodoInspector;
}
