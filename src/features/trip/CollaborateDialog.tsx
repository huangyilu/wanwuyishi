/**
 * 邀请协作弹窗（owner 端）。
 *
 * 走既有 Supabase 表 trip_invites + RPC 链路：createInvite 生成令牌 → 拼成
 * 可分享链接（#/trips?token=xxx）→ 朋友打开后 JoinDialog 调 join_trip_by_token
 * 成为该行程的真实成员（user_id=其账号、role=member），RLS 即授予读+改权限。
 *
 * 仅云端模式可用：本地存储无多用户概念，repo.createInvite 会直接抛错提示。
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTripRepo } from '../../data';
import s from './collaborate.module.css';

function linkFor(token: string): string {
  return `${window.location.origin}/#/trips?token=${token}`;
}

export function CollaborateDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const repo = useTripRepo();
  const qc = useQueryClient();
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [maxUses, setMaxUses] = useState(20);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const invites = useQuery({
    queryKey: ['invites', tripId],
    queryFn: () => repo.listInvites(tripId),
  });

  async function generate() {
    setBusy(true);
    setErr(null);
    setCreated(null);
    try {
      const inv = await repo.createInvite(tripId, { expiresInDays, maxUses });
      setCreated(inv.token);
      await qc.invalidateQueries({ queryKey: ['invites', tripId] });
    } catch (e) {
      setErr((e as Error).message || '生成失败');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setErr(null);
    try {
      await repo.revokeInvite(id);
      await qc.invalidateQueries({ queryKey: ['invites', tripId] });
    } catch (e) {
      setErr((e as Error).message || '撤销失败');
    }
  }

  function copy() {
    if (!created) return;
    void navigator.clipboard?.writeText(linkFor(created));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.card} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className={s.close} onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className={s.title}>邀请协作</div>
        <p className={s.sub}>
          生成一条邀请链接发给朋友。对方打开并登录云端后，就成为该行程的成员，可以一起编辑排期、账本与打包清单。
        </p>

        {created ? (
          <>
            <label className={s.label}>邀请链接（复制发给朋友）</label>
            <div className={s.linkBox}>
              <input className="field" readOnly value={linkFor(created)} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn btn-primary btn-sm" onClick={copy}>
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <button className={`btn btn-sm ${s.full}`} onClick={() => setCreated(null)}>
              再生成一个
            </button>
          </>
        ) : (
          <>
            <div className={s.row}>
              <div>
                <label className={s.label}>有效期</label>
                <select
                  className="field"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                >
                  <option value={7}>7 天</option>
                  <option value={30}>30 天</option>
                  <option value={90}>90 天</option>
                  <option value={0}>永久</option>
                </select>
              </div>
              <div>
                <label className={s.label}>最多使用次数</label>
                <select
                  className="field"
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                >
                  <option value={1}>1 次</option>
                  <option value={5}>5 次</option>
                  <option value={20}>20 次</option>
                  <option value={9999}>不限</option>
                </select>
              </div>
            </div>
            <button className={`btn btn-primary ${s.full}`} onClick={() => void generate()} disabled={busy}>
              {busy ? '生成中…' : '生成邀请链接'}
            </button>
          </>
        )}

        {err && <div className={s.err}>{err}</div>}

        {invites.data && invites.data.length > 0 && (
          <div className={s.list}>
            <div className={s.listTitle}>已有邀请</div>
            {invites.data.map((inv) => (
              <div key={inv.id} className={s.inv}>
                <div className={s.invMain}>
                  <div className={s.invToken}>{inv.token}</div>
                  <div className={s.invMeta}>
                    {inv.usedCount}/{inv.maxUses === 9999 ? '∞' : inv.maxUses} 次
                    {inv.expiresAt ? ` · 至 ${inv.expiresAt.slice(0, 10)}` : ' · 永久'}
                  </div>
                </div>
                <button className={`btn btn-sm btn-ghost ${s.btnSm}`} onClick={() => void revoke(inv.id)}>
                  撤销
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
