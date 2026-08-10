/**
 * 登录状态条。双端共用。
 *
 * - 未配置 Supabase（无 env）：整体不渲染，本地模式零干扰
 * - 未登录：显示「登录」按钮，点击弹出登录对话框（邮箱+密码 / 匿名 / 魔法链接）
 * - 已登录：显示「显示名称」药丸（点击改名字）+「登出」
 *
 * 详情见 LoginDialog / AccountDialog。为何依赖登录：云端模式的 RLS 基于 auth.uid()，
 * 两种登录都拿到真实 uid。显示名来自 profiles.display_name（本人可改）。
 */
import { useState } from 'react';
import { isSupabaseConfigured, signOut, useSession } from '../../data/supabase-client';
import { useProfile } from './useProfile';
import { LoginDialog } from './LoginDialog';
import { AccountDialog } from './AccountDialog';
import s from './AuthBar.module.css';

export function AuthBar() {
  const { user, loading } = useSession();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [acct, setAcct] = useState(false);

  if (!isSupabaseConfigured) return null;
  if (loading) return <span className={s.bar}>…</span>;

  if (user) {
    const label =
      profile?.display_name ||
      (user.is_anonymous ? '匿名用户' : user.email ?? user.id.slice(0, 8));
    return (
      <>
        <button
          className={s.user}
          onClick={() => setAcct(true)}
          title="点击修改显示名称"
        >
          {label}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => signOut()}>
          登出
        </button>
        {acct && <AccountDialog onClose={() => setAcct(false)} />}
      </>
    );
  }

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        登录
      </button>
      {open && <LoginDialog onClose={() => setOpen(false)} />}
    </>
  );
}
