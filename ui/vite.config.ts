/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

const rootDir = dirname(fileURLToPath(import.meta.url));
const iconsPackagePath = resolve(rootDir, '../../revamp/eonui_ultimate/eonui/packages/icons');

function eonIconRawStubPlugin() {
  return {
    enforce: 'pre' as const,
    load(id: string) {
      if (id.startsWith('\0couponleo-test-icon:')) {
        return 'export default "<svg></svg>";';
      }

      return null;
    },
    name: 'couponleo-test-eon-icon-raw-stub',
    resolveId(id: string) {
      if (
        id.startsWith('@eonui/icons/svg/')
        || (id.includes('/eon-svg/') && id.endsWith('.svg?raw'))
      ) {
        return `\0couponleo-test-icon:${id}`;
      }

      return null;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  optimizeDeps: {
    include: ['@angular/forms'],
  },
  resolve: {
    mainFields: ['module'],
  },
  server: {
    fs: {
      allow: [rootDir, iconsPackagePath],
    },
  },
  plugins: [
    ...(mode === 'test' ? [eonIconRawStubPlugin()] : []),
    analog(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
}));
