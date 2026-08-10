import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { RepositoryProvider } from '../data';
import { AuthQuerySync } from '../features/auth/AuthQuerySync';
import { ToastProvider } from '../ui/toast';
import '../ui/base.css';
import { router } from './router';

/**
 * 世界库是静态内容、行程数据本地即时可得，所以关掉了窗口聚焦重取，
 * 免得切个标签页回来就闪一下。真正的实时性由 Supabase Realtime 在 M4 接管。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root 不存在');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider>
        <ToastProvider>
          <AuthQuerySync />
          <RouterProvider router={router} />
        </ToastProvider>
      </RepositoryProvider>
    </QueryClientProvider>
  </StrictMode>,
);
