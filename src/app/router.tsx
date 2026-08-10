import { Navigate, createHashRouter, Link } from 'react-router-dom';
import { TripPage } from '../pages/TripPage';
import { TripsPage } from '../pages/TripsPage';
import { WorldPage } from '../pages/WorldPage';
import { AppShell } from './AppShell';

function NotFound() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)' }}>
      没有这个页面。<Link to="/trips">回到我的行程</Link>
    </div>
  );
}

// GitHub Pages 不支持服务端 SPA fallback，改用 HashRouter：
// 路由落在 # 之后，服务器永远只收到 /，对子路径与离线 file:// 都零配置兼容
export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/trips" replace /> },
      { path: 'trips', element: <TripsPage /> },
      { path: 'trip/:tripId', element: <TripPage /> },
      { path: 'world', element: <WorldPage /> },
      { path: 'world/poi/:poiId', element: <WorldPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
