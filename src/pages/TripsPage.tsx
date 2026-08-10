import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTripRepo } from '../data';
import { isSupabaseConfigured } from '../data/supabase-client';
import { formatCn } from '../domain/date';
import { useCreateTrip, useTrips } from '../features/trip/queries';
import { JoinDialog } from '../features/trip/JoinDialog';
import s from './TripsPage.module.css';

const STATUS_CN: Record<string, string> = {
  planning: '筹备中',
  ongoing: '进行中',
  finished: '已结束',
  archived: '已归档',
};

export function TripsPage() {
  const { data: trips, isLoading } = useTrips();
  const create = useCreateTrip();
  const repo = useTripRepo();
  const nav = useNavigate();

  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);

  async function submit() {
    const name = title.trim() || '未命名行程';
    const trip = await create.mutateAsync({
      title: name,
      startDate: start || null,
      endDate: end || null,
    });
    setTitle('');
    setStart('');
    setEnd('');
    nav(`/trip/${trip.id}`);
  }

  return (
    <div className={`${s.page} scroll-y`}>
      <div className={s.inner}>
        <h1 className={s.h1}>我的行程</h1>
        <p className={s.lead}>
          一份行程 = 一个可执行的作战计划：排期、闭馆校验、票务死线、账本、签证行程单，都挂在它下面。
        </p>

        <div className={s.creator}>
          <input
            className={`field ${s.titleField}`}
            placeholder="行程名，比如「法意瑞 12 天」"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          <input
            className={s.dateField}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            title="出发日期（可以先不填）"
          />
          <span className="muted">→</span>
          <input
            className={s.dateField}
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            title="返程日期（可以先不填）"
          />
          <button className="btn btn-primary" onClick={() => void submit()} disabled={create.isPending}>
            新建行程
          </button>
        </div>
        <div className={s.tips}>
          日期可以留空，先把想去的点攒起来，定下来再补——排期和闭馆校验会自动跟着日期走。
        </div>

        {isSupabaseConfigured && (
          <div className={s.joinRow}>
            <span>朋友分享了行程给你？</span>
            <button className="btn btn-sm" onClick={() => setJoinOpen(true)}>
              用令牌加入
            </button>
          </div>
        )}

        <div className={s.list}>
          {isLoading && <div className={s.empty}>读取中…</div>}
          {!isLoading && (trips ?? []).length === 0 && (
            <div className={s.empty}>还没有行程。上面起个名字，就能开工了。</div>
          )}
          {(trips ?? []).map((t) => (
            <Link key={t.id} to={`/trip/${t.id}`} className={s.row}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>{t.title}</div>
                <div className={s.rowSub}>
                  {t.startDate && t.endDate
                    ? `${formatCn(t.startDate)} – ${formatCn(t.endDate)}`
                    : '日期未定'}
                  {' · '}
                  更新于 {new Date(t.updatedAt).toLocaleString('zh-CN', { hour12: false           })}
        </div>
      {joinOpen && <JoinDialog onClose={() => setJoinOpen(false)} />}
      </div>
              <span className={s.status}>{STATUS_CN[t.status] ?? t.status}</span>
              <button
                className={s.del}
                title="删除行程"
                onClick={async (e) => {
                  e.preventDefault();
                  if (!window.confirm(`删除「${t.title}」？这一步不可撤销。`)) return;
                  await repo.deleteTrip(t.id);
                  window.location.reload();
                }}
              >
                ×
              </button>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
