import { plugin } from 'bun';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

plugin({
  name: 'css-stub',
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, () => ({
      loader: 'js',
      contents: 'export default new Proxy({}, { get: (_, k) => k });',
    }));
    build.onLoad({ filter: /\.css$/ }, () => ({
      loader: 'js',
      contents: 'export default {};',
    }));
  },
});

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
