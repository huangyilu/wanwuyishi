/**
 * 应用外壳 —— 双端在这里分流。
 *
 * 不是响应式：PC 端是常驻三栏的作战台，移动端是单列的随身册子，
 * 两套布局各自渲染，只共用数据层与 domain。
 */
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useRepositories } from '../data';
import { useViewMode } from '../hooks/useViewMode';
import { AuthBar } from '../features/auth/AuthBar';
import { JoinDialog } from '../features/trip/JoinDialog';
import s from './AppShell.module.css';

function StorageBadge() {
  const { trip } = useRepositories();
  const cloud = trip.capabilities.canSync;
  return (
    <span className={s.storage} title={cloud ? '数据已同步到云端' : '数据只存在这台机器的浏览器里'}>
      <span className={cloud ? s.dotCloud : s.dotLocal} />
      {cloud ? '云端同步' : '仅本机'}
    </span>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `${s.navLink} ${isActive ? s.navActive : ''}`;

function DesktopShell() {
  const [, setMode] = useViewMode();
  return (
    <div className={s.shell}>
      <header className={s.header}>
        <NavLink to="/" className={s.brand}>
          <span className={s.brandDot} />
          玩无一失
          <span className={s.slogan}>把攻略做到万无一失</span>
        </NavLink>
        <nav className={s.nav}>
          <NavLink to="/trips" className={navCls}>
            我的行程
          </NavLink>
          <NavLink to="/world" className={navCls}>
            世界库
          </NavLink>
        </nav>
        <div className={s.right}>
          <StorageBadge />
          <AuthBar />
          <button className="btn btn-sm btn-ghost" onClick={() => setMode('mobile')} title="预览随身模式">
            随身模式
          </button>
        </div>
      </header>
      <main className={s.body}>
        <Outlet />
      </main>
    </div>
  );
}

const mTabCls = ({ isActive }: { isActive: boolean }) => `${s.mTab} ${isActive ? s.mTabActive : ''}`;

function MobileShell() {
  const [, setMode] = useViewMode();
  const { pathname } = useLocation();
  const tripMatch = /^\/trip\/([^/]+)/.exec(pathname);
  const tripId = tripMatch?.[1];

  return (
    <div className={s.mShell}>
      <div className={s.mAuthRow}>
        <AuthBar />
        <button className={s.mSwitch} onClick={() => setMode('desktop')} title="切换到电脑端作战台">
          🖥 切到作战台
        </button>
      </div>
      <main className={s.mBody}>
        <Outlet />
      </main>
      <nav className={s.mTabs}>
        {tripId && (
          <NavLink to={`/trip/${tripId}`} className={mTabCls} end>
            <span className={s.mTabIcon}>📍</span>
            今天
          </NavLink>
        )}
        <NavLink to="/trips" className={mTabCls}>
          <span className={s.mTabIcon}>🗂</span>
          行程
        </NavLink>
        <NavLink to="/world" className={mTabCls}>
          <span className={s.mTabIcon}>🌍</span>
          世界库
        </NavLink>
      </nav>
    </div>
  );
}

export function AppShell() {
  const [mode] = useViewMode();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token');
  const [joinOpen, setJoinOpen] = useState(false);
  const seenToken = useRef<string | null>(null);

  // 深链：打开别人发的 #/...?token=xxx 自动弹出加入弹窗
  useEffect(() => {
    if (token && seenToken.current !== token) {
      seenToken.current = token;
      setJoinOpen(true);
    }
  }, [token]);

  const closeJoin = () => {
    setJoinOpen(false);
    if (params.get('token')) nav({ search: '' });
  };

  return (
    <>
      {mode === 'desktop' ? <DesktopShell /> : <MobileShell />}
      {joinOpen && <JoinDialog token={token ?? undefined} onClose={closeJoin} />}
    </>
  );
}
