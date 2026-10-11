import { defineConfig } from 'vitest/config';

// Components render in a simulated browser (jsdom).
export default defineConfig({ test: { include: ['src/**/*.test.tsx'], environment: 'jsdom' } });
