/**
 * 加入行程弹窗（朋友端）。
 *
 * 凭邀请令牌调用 repo.joinTripByToken → 后端 RPC join_trip_by_token 在该账号下
 * 插入真实 trip_members（user_id=auth.uid(), role=member）。成功后 RLS 自动授予
 * 对该行程的读+改权限。需先登录云端（匿名也算 authenticated，可加入）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTripRepo } from '../../data';
import { isSupabaseConfigured, useSession } from '../../data/supabase-client';
import { LoginDialog } from '../auth/LoginDialog';
import s from './collaborate.module.css';

export function JoinDialog({ token: tokenProp, onClose }: { token?: string; onClose: () => void }) {
  const repo = useTripRepo();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { user } = useSession();
  const [token, setToken] = useState(tokenProp ?? '');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const join = useMutation({
    mutationFn: () => repo.joinTripByToken(token.trim(), name.trim() || null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['trip', 'list'] });
      setDone(true);
      setTimeout(() => {
        onClose();
        nav('/trips');
      }, 900);
    },
    onError: (e) => setErr((e as Error).message || '加入失败'),
  });

  if (!isSupabaseConfigured) {
    return (
      <div className={s.overlay} onClick={onClose}>
        <div className={s.card} role="dialog" onClick={(e) => e.stopPropagation()}>
          <button className={s.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
          <div className={s.title}>加入行程</div>
          <p className={s.sub}>当前是本地模式，未连接云端，无法加入协作。请先部署/配置云端后再试。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.card} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className={s.close} onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className={s.title}>加入行程</div>

        {done ? (
          <p className={s.ok}>已加入！正在跳转到你的行程列表…</p>
        ) : (
          <>
            <p className={s.sub}>粘贴朋友发来的邀请令牌（链接里 token= 后面那串），即可成为该行程的成员、一起编辑。</p>

            {!user ? (
              <div className={s.err}>需要先登录云端才能加入。匿名登录也能加入协作。</div>
            ) : null}

            <label className={s.label}>邀请令牌</label>
            <input
              className="field"
              placeholder="粘贴 token，如 aB3xK…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />

            <label className={s.label}>你的显示名（可选）</label>
            <input
              className="field"
              placeholder="旅伴 / 你的名字"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {err && <div className={s.err}>{err}</div>}

            <button
              className={`btn btn-primary ${s.full}`}
              disabled={join.isPending || !user || !token.trim()}
              onClick={() => join.mutate()}
            >
              {join.isPending ? '加入中…' : '加入行程'}
            </button>

            {!user && (
              <button className={`btn btn-sm ${s.full}`} onClick={() => setShowLogin(true)}>
                去登录 / 注册
              </button>
            )}
          </>
        )}
      </div>
      {showLogin && <LoginDialog onClose={() => setShowLogin(false)} />}
    </div>
  );
}
