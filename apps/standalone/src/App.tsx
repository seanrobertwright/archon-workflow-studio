import { ThemeProvider } from '@archon-studio/core';

export function App() {
  return (
    <ThemeProvider preset="archon-dark">
      <div style={{ padding: 24 }}>
        <h1>Archon Workflow Studio</h1>
        <p>Phase 0 scaffolding. Real UI lands in Phase 2.</p>
      </div>
    </ThemeProvider>
  );
}
