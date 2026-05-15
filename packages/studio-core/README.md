# @archon-studio/core

React component library for building Archon workflow editors.

## Installation

This package is part of the Archon Workflow Studio monorepo. It is not yet published to npm.

## Usage

```tsx
import { WorkflowBuilder } from '@archon-studio/core';
import type { WorkflowApiClient } from '@archon-studio/core';

const client: WorkflowApiClient = /* your ArchonApiClient instance */;

function App() {
  return (
    <WorkflowBuilder
      client={client}
      archonUrl="http://localhost:3737"
      cwd="/home/user/my-project"
      workflowName="my-workflow"
      onSave={() => { /* called when user clicks Save */ }}
    />
  );
}
```

## Key exports

| Export                     | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `WorkflowBuilder`          | Full editor shell (canvas + library + inspector + toolbar + validation) |
| `NodeInspector`            | Per-node inspector panel                                                |
| `ThemePicker`              | Theme switcher (dark / light / high-contrast)                           |
| `useBuilderStore`          | Zustand store — nodes, positions, selection, undo                       |
| `useUndoStore`             | Undo/redo stack with coalesce window                                    |
| `useThemeStore`            | Theme persistence                                                       |
| `fromWorkflowDefinition`   | Convert Archon WorkflowDefinition → builder store input                 |
| `toWorkflowDefinition`     | Convert builder store state → WorkflowDefinition                        |
| `serializeYaml`            | Serialize workflow to YAML string + source map                          |
| `workflowDefinitionSchema` | Zod schema for WorkflowDefinition                                       |

## Peer dependencies

- `react` ^19
- `react-dom` ^19
- `@xyflow/react` ^12
- `@tanstack/react-query` ^5
