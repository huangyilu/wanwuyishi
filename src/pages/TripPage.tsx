/**
 * 行程页的双端分流点 + 时间线/账本 切换标签。
 *
 * 两端各自 lazy 加载：手机上不会去下 dnd-kit 和三栏工作台的代码，
 * PC 上也不会下移动壳，这是"双端不是响应式"在打包层面的兑现。
 * 账本（LedgerPanel）是单列组件，两端共用同一份。
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useViewMode } from '../hooks/useViewMode';
import { isSupabaseConfigured, useSession } from '../data/supabase-client';
import { useTripBundle } from '../features/trip/queries';
import { usePoiMap, useWorldIndex } from '../features/world/queries';
import { tripToMarkdown } from '../domain/trip/export-md';
import { downloadTextFile, safeFileName } from '../utils/download';
import { CollaborateDialog } from '../features/trip/CollaborateDialog';
import { ChatPanel } from '../features/trip/ChatPanel';
import s from './TripPage.module.css';

const Workbench = lazy(() =>
  import('../features/trip/Workbench').then((m) => ({ default: m.Workbench })),
);
const MobileTrip = lazy(() =>
  import('../features/trip/MobileTrip').then((m) => ({ default: m.MobileTrip })),
);
const LedgerPanel = lazy(() =>
  import('../features/expense/LedgerPanel').then((m) => ({ default: m.LedgerPanel })),
);
const PackingPanel = lazy(() =>
  import('../features/trip/PackingPanel').then((m) => ({ default: m.PackingPanel })),
);

function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)' }}>
      装配工作台…
    </div>
  );
}

export function TripPage() {
  const { tripId } = useParams();
  const [mode] = useViewMode();
  const [tab, setTab] = useState<'timeline' | 'ledger' | 'packing'>('timeline');
  const [invite, setInvite] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { user } = useSession();
  const { data: bundle } = useTripBundle(tripId);
  const isOwner = Boolean(tripId && user?.id && bundle?.trip.ownerId === user.id);
  const canCollaborate = isSupabaseConfigured && isOwner;

  // 关闭菜单：点外面 / Esc
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // 导出行程单所需的世界库查表：把 POI / 城市 id 翻成可读名字
  const poiIds = useMemo(
    () =>
      Array.from(
        new Set((bundle?.items ?? []).map((i) => i.poiId).filter((x): x is string => Boolean(x))),
      ),
    [bundle],
  );
  const { data: poiMap } = usePoiMap(poiIds);
  const { data: index } = useWorldIndex();

  function buildMd(): string | null {
    if (!bundle) return null;
    return tripToMarkdown(bundle, {
      poiMap: poiMap ?? {},
      cities: index?.cities ?? [],
      countries: index?.countries ?? [],
    });
  }

  function handleExportMd() {
    const md = buildMd();
    if (!md || !bundle) return;
    downloadTextFile(`${safeFileName(bundle.trip.title)}_行程单.md`, md);
  }

  async function copyMd() {
    const md = buildMd();
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  }

  if (!tripId) return <Navigate to="/trips" replace />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className={s.tabs}>
        <button className={`${s.tab} ${tab === 'timeline' ? s.tabOn : ''}`} onClick={() => setTab('timeline')}>
          时间线
        </button>
        <button className={`${s.tab} ${tab === 'ledger' ? s.tabOn : ''}`} onClick={() => setTab('ledger')}>
          账本
        </button>
        <button className={`${s.tab} ${tab === 'packing' ? s.tabOn : ''}`} onClick={() => setTab('packing')}>
          打包
        </button>
        <div className={s.moreWrap} ref={menuRef}>
          <button
            className={`${s.moreBtn} ${menuOpen ? s.moreBtnOn : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="更多操作"
            title="更多操作（邀请 / 预览 / 下载 / 复制）"
          >
            <span className={s.moreIcon} aria-hidden="true">
              ⋯
            </span>
            <span className={s.moreLabel}>更多</span>
          </button>
          {menuOpen && (
            <div className={s.moreMenu} role="menu">
              {canCollaborate && (
                <button
                  className={s.menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    setInvite(true);
                  }}
                  role="menuitem"
                >
                  <span className={s.menuIcon}>👥</span>
                  <span>邀请协作</span>
                </button>
              )}
              <button
                className={s.menuItem}
                disabled={!bundle}
                onClick={() => {
                  setMenuOpen(false);
                  setShowPreview(true);
                }}
                role="menuitem"
              >
                <span className={s.menuIcon}>👁</span>
                <span>预览行程单</span>
              </button>
              <button
                className={`${s.menuItem} ${s.menuItemPrimary}`}
                disabled={!bundle}
                onClick={() => {
                  setMenuOpen(false);
                  handleExportMd();
                }}
                role="menuitem"
              >
                <span className={s.menuIcon}>⬇</span>
                <span>下载行程单</span>
              </button>
              <button
                className={s.menuItem}
                disabled={!bundle}
                onClick={() => {
                  setMenuOpen(false);
                  void copyMd();
                }}
                role="menuitem"
              >
                <span className={s.menuIcon}>{copied ? '✓' : '⧉'}</span>
                <span>{copied ? '已复制' : '复制 Markdown'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={s.body}>
        <Suspense fallback={<Loading />}>
          {tab === 'packing' ? (
            <PackingPanel tripId={tripId} />
          ) : tab === 'ledger' ? (
            <LedgerPanel tripId={tripId} />
          ) : mode === 'desktop' ? (
            <Workbench tripId={tripId} />
          ) : (
            <MobileTrip
              tripId={tripId}
              onAction={(a) => {
                if (a.kind === 'tab') setTab(a.tab);
                // day 跳转到具体某天，需要在时间线 tab 下生效；这里先切到时间线，
                // 由 MobileTrip 通过 URL 锚点 / state 进一步定位。
                else if (a.kind === 'day') setTab('timeline');
              }}
            />
          )}
        </Suspense>
      </div>
      {invite && <CollaborateDialog tripId={tripId} onClose={() => setInvite(false)} />}

      {showPreview && (
        <div className={s.overlay} onClick={() => setShowPreview(false)}>
          <div
            className={s.previewCard}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={s.previewHead}>
              <span className={s.previewTitle}>行程单预览（Markdown）</span>
              <button className={s.close} onClick={() => setShowPreview(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <pre className={s.previewBody}>{buildMd() ?? '（行程为空）'}</pre>
            <div className={s.previewFoot}>
              <button className="btn btn-ghost btn-sm" onClick={() => void copyMd()} disabled={!bundle}>
                {copied ? '已复制' : '复制'}
              </button>
              <button className="btn btn-sm" onClick={handleExportMd} disabled={!bundle}>
                下载 .md
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 行程助手：跨时间线/账本/打包 三个标签始终悬浮右侧 */}
      <ChatPanel tripId={tripId} />
    </div>
  );
}
