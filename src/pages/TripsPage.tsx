import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTripRepo } from '../data';
import { isSupabaseConfigured } from '../data/supabase-client';
import { formatCn } from '../domain/date';
import { useCreateTrip, useTrips } from '../features/trip/queries';
import { JoinDialog } from '../features/trip/JoinDialog';
import { EmptyArt } from '../ui/illustrations';
import s from './TripsPage.module.css';

const STATUS_CN: Record<string, string> = {
  planning: '筹备中',
  ongoing: '进行中',
  finished: '已结束',
  archived: '已归档',
};

const STATUS_TONE = {
  planning: s.stampPlan,
  ongoing: s.stampOn,
  finished: s.stampDone,
  archived: s.stampArch,
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
        {/* —— 英雄区：探险开场 —— */}
        <section className={s.hero}>
          <div className={s.heroText}>
            <div className={s.kicker}>
              <span className={s.diamond} />
              Tour the World
            </div>
            <h1 className={s.h1}>我的行程</h1>
            <p className={s.lead}>
              小红书收藏的景点、备忘录里的航班、聊天记录里的地址 —— 散落各处的攻略，
              一次收齐，串成一份<strong>可执行</strong>的行程：
              排期、订票、闭馆、账本，从这里出发。
            </p>
          </div>
          <div className={s.heroArt} aria-hidden>
            <svg viewBox="0 0 160 160" className={s.compass}>
              <circle cx="80" cy="80" r="74" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
              <circle
                cx="80"
                cy="80"
                r="60"
                fill="none"
                stroke="var(--brand)"
                strokeWidth="2"
                strokeDasharray="2 11.3"
                className={s.ring}
              />
              <circle cx="80" cy="80" r="42" fill="var(--brand-soft)" />
              <polygon points="80,44 89,80 71,80" fill="var(--brand)" />
              <polygon points="80,116 89,80 71,80" fill="var(--gold)" />
              <circle cx="80" cy="80" r="4.5" fill="var(--bg)" stroke="var(--brand)" strokeWidth="1.5" />
              <text x="80" y="30" textAnchor="middle" className={s.compassLetter}>
                N
              </text>
              <text x="80" y="141" textAnchor="middle" className={s.compassLetter}>
                S
              </text>
              <text x="143" y="84" textAnchor="middle" className={s.compassLetter}>
                E
              </text>
              <text x="17" y="84" textAnchor="middle" className={s.compassLetter}>
                W
              </text>
            </svg>
          </div>
        </section>

        {/* —— 发起新旅程 —— */}
        <div className={s.creatorCard}>
          <div className={s.tape} aria-hidden />
          <div className={s.creatorHead}>
            <span className={s.creatorMark}>✦</span> 发起新旅程
          </div>
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
            <div className={s.empty}>
              <EmptyArt kind="map" size={120} className={s.emptyArt} />
              <span className={s.emptyText}>还没有行程。在上面起个名字，就能开工了。</span>
            </div>
          )}
          {(trips ?? []).map((t, i) => {
            const days =
              t.startDate && t.endDate
                ? Math.round(
                    (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000,
                  ) + 1
                : 0;
            return (
              <Link
                key={t.id}
                to={`/trip/${t.id}`}
                className={s.card}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className={s.cardStub} aria-hidden />
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{t.title}</div>
                  <div className={s.rowSub}>
                    {t.startDate && t.endDate ? `${formatCn(t.startDate)} – ${formatCn(t.endDate)}` : '日期未定'}
                    {days > 0 && <span className={s.dayBadge}>{days} 天</span>}
                    <span className={s.dot}>·</span>
                    更新于 {new Date(t.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                  </div>
                </div>
                <span className={`${s.stamp} ${STATUS_TONE[t.status] ?? ''}`}>
                  {STATUS_CN[t.status] ?? t.status}
                </span>
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
            );
          })}
        </div>
      </div>
      {joinOpen && <JoinDialog onClose={() => setJoinOpen(false)} />}
    </div>
  );
}
