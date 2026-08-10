/**
 * 行程页的双端分流点 + 时间线/账本 切换标签。
 *
 * 两端各自 lazy 加载：手机上不会去下 dnd-kit 和三栏工作台的代码，
 * PC 上也不会下移动壳，这是"双端不是响应式"在打包层面的兑现。
 * 账本（LedgerPanel）是单列组件，两端共用同一份。
 */
import { Suspense, lazy, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useViewMode } from '../hooks/useViewMode';
import { isSupabaseConfigured, useSession } from '../data/supabase-client';
import { useTripBundle } from '../features/trip/queries';
import { CollaborateDialog } from '../features/trip/CollaborateDialog';
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
  const { user } = useSession();
  const { data: bundle } = useTripBundle(tripId);
  const isOwner = Boolean(tripId && user?.id && bundle?.trip.ownerId === user.id);
  const canCollaborate = isSupabaseConfigured && isOwner;

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
        {canCollaborate && (
          <button className={`btn btn-sm ${s.inviteBtn}`} onClick={() => setInvite(true)}>
            邀请协作
          </button>
        )}
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
            <MobileTrip tripId={tripId} />
          )}
        </Suspense>
      </div>
      {invite && <CollaborateDialog tripId={tripId} onClose={() => setInvite(false)} />}
    </div>
  );
}
