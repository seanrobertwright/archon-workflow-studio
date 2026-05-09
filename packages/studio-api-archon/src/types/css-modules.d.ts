// Required because workspace consumers tsc-check studio-core's source tree,
// which imports CSS modules (e.g., WorkflowBuilder.module.css).
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
