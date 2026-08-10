/**
 * 账户卡片：查看当前身份 + 修改显示名称 + 登出。
 *
 * 显示名称写回 profiles.display_name（RLS 允许本人改）。别名是全局昵称，所有行程统一显示：
 * 成员名在 getBundle 时按 profiles.display_name 优先覆盖（含同伴，RPC 以 security definer 读取），
 * 故改完只需失效 ['profile'] 与 ['trip','bundle']，账本 / 时间线立即刷新。
 */
import { useState } from 'react';
import { signOut, useSession } from '../../data/supabase-client';
import { useProfile, useUpdateDisplayName } from './useProfile';
import s from './LoginDialog.module.css';

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useSession();
  const { profile } = useProfile();
  const updateName = useUpdateDisplayName();
  const saving = updateName.isPending;
  const [name, setName] = useState(profile?.display_name ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const identity = user?.is_anonymous ? '匿名用户' : user?.email ?? '已登录';
  const original = profile?.display_name ?? '';
  const trimmed = name.trim();
  const unchanged = trimmed === original || trimmed.length === 0;

  async function save() {
    setErr(null);
    setOk(false);
    try {
      await updateName.mutateAsync(name);
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    }
  }

  return (
    <div className={s.overlay} onMouseDown={onClose}>
      <div className={s.card} onMouseDown={(e) => e.stopPropagation()}>
        <button className={s.close} onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className={s.title}>账户</div>
        <div className={s.sub}>{identity}</div>

        <label className={s.label} htmlFor="dn">
          显示名称
        </label>
        <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>
          这是你的全局昵称，修改后会同步到所有行程。
        </div>
        <input
          id="dn"
          className="field"
          value={name}
          maxLength={24}
          placeholder="你的昵称，在所有行程中通用"
          onChange={(e) => {
            setName(e.target.value);
            setOk(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !unchanged && !saving) save();
          }}
        />

        {err && <div className={s.err}>{err}</div>}
        {ok && <div className={s.ok}>已保存</div>}

        <button
          className="btn btn-primary full"
          style={{ marginTop: 14 }}
          onClick={save}
          disabled={saving || unchanged}
        >
          {saving ? '保存中…' : '保存名称'}
        </button>

        <div className={s.alt}>
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>换个身份</span>
          <button
            className={s.link}
            onClick={() => {
              signOut();
              onClose();
            }}
          >
            登出
          </button>
        </div>
      </div>
    </div>
  );
}
