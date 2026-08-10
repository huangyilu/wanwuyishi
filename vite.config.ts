import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // GitHub Pages 项目页部署在 username.github.io/<repo>/ 子路径下，
  // 用相对路径让资源与路由在子路径、以及离线 file:// 下都能加载
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    strictPort: false,
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // 双端分流的代码分割在 AppShell 的动态 import 里完成，
        // 这里只把体积大且两端都不首屏需要的库单独切出去
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
