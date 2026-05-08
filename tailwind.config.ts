import type { Config } from 'tailwindcss';

export default {
  content: ['./apps/*/index.html', './apps/*/src/**/*.{ts,tsx}', './packages/*/src/**/*.{ts,tsx}'],
} satisfies Config;
