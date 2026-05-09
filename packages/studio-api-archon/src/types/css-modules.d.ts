// Required because workspace consumers tsc-check studio-core's source tree,
// where DagNodeComponent.module.css and WorkflowBuilder.module.css live.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
