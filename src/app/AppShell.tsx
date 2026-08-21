/**
 * 应用外壳 —— 双端在这里分流。
 *
 * 不是响应式：PC 端是常驻三栏的作战台，移动端是单列的随身册子，
 * 两套布局各自渲染，只共用数据层与 domain。
 *
 * 移动端把"用户信息 + 登出 + 切到作战台"折叠成右上角头像按钮 + popover，
 * 不占独立横排——和页面（行程页 tabs / 世界库 mHead）合成一条顶部栏。
 */
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useRepositories } from '../data';
import { useViewMode } from '../hooks/useViewMode';
import { isSupabaseConfigured, signOut, useSession } from '../data/supabase-client';
import { useProfile } from '../features/auth/useProfile';
import { AuthBar } from '../features/auth/AuthBar';
import { LoginDialog } from '../features/auth/LoginDialog';
import { AccountDialog } from '../features/auth/AccountDialog';
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
          <svg className={s.brandMark} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--brand)" strokeWidth="1.5" />
            <path d="M12 3.5 L14.2 12 L12 20.5 L9.8 12 Z" fill="var(--brand)" />
            <path d="M12 3.5 L12 20.5 L9.8 12 Z" fill="var(--brand-hover)" opacity="0.55" />
            <circle cx="12" cy="12" r="1.7" fill="var(--bg)" />
            <circle cx="12" cy="12" r="1.7" fill="none" stroke="var(--brand)" strokeWidth="1" />
          </svg>
          Tour the World
          <span className={s.slogan}>Plan. Pack. Go.</span>
        </NavLink>
        <nav className={s.nav}>
          <NavLink to="/trips" className={navCls}>
            我的行程
          </NavLink>
          <NavLink to="/world" className={navCls}>
            世界
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

/**
 * 移动端右上角：把用户名 / 登出 / 切到桌面塞进一个头像 popover，
 * 让顶部只有一条横排（页面自身的 tabs 或 mHead），不再叠一行 auth row。
 */
function MobileAccountMenu() {
  const [, setMode] = useViewMode();
  const { user, loading } = useSession();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  if (!isSupabaseConfigured) {
    return (
      <button
        className={s.mSwitch}
        onClick={() => setMode('desktop')}
        title="切换到电脑端作战台"
        aria-label="切换到电脑端"
      >
        🖥
      </button>
    );
  }

  if (loading) return <span className={s.mAvatar} aria-hidden>·</span>;
  if (!user) {
    return (
      <button className={s.mLogin} onClick={() => setLoginOpen(true)} title="登录云端账号">
        登录
      </button>
    );
  }

  const label =
    profile?.display_name ||
    (user.is_anonymous ? '匿名' : user.email ?? user.id.slice(0, 8));
  const initial = label.trim().charAt(0).toUpperCase() || '我';

  return (
    <div className={s.mMenuWrap} ref={ref}>
      <button
        className={s.mAvatar}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
      >
        {initial}
      </button>
      {open && (
        <div className={s.mMenu} role="menu">
          <div className={s.mMenuId}>{label}</div>
          <button
            className={s.mMenuItem}
            onClick={() => {
              setOpen(false);
              setAcctOpen(true);
            }}
          >
            改名 / 账号
          </button>
          <button
            className={s.mMenuItem}
            onClick={() => {
              setMode('desktop');
              setOpen(false);
            }}
          >
            🖥 切到作战台
          </button>
          <button
            className={`${s.mMenuItem} ${s.mMenuDanger}`}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            登出
          </button>
        </div>
      )}
      {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
      {acctOpen && <AccountDialog onClose={() => setAcctOpen(false)} />}
    </div>
  );
}

function MobileShell() {
  const { pathname } = useLocation();
  const tripMatch = /^\/trip\/([^/]+)/.exec(pathname);
  const tripId = tripMatch?.[1];

  return (
    <div className={s.mShell}>
      <main className={s.mBody}>
        <Outlet />
      </main>
      <nav className={s.mTabs}>
        {tripId && (
          <NavLink to={`/trip/${tripId}?view=today`} className={mTabCls} end>
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
          世界
        </NavLink>
        <div className={s.mTabsRight}>
          <MobileAccountMenu />
        </div>
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