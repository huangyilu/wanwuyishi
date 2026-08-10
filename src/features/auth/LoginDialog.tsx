/**
 * 登录对话框（浮层 + 居中卡片）。
 *
 * 把登录表单从顶栏里挪出来做成独立弹窗：样式可控、双端通用（PC 顶栏 / 移动端底栏都只留一个「登录」按钮）。
 * 支持：邮箱+密码登录、邮箱+密码注册（含「注册/登录」切换）、匿名快速体验、邮箱魔法链接。
 */
import { useState } from 'react';
import {
  signInAnonymously,
  signInWithOtp,
  signInWithPassword,
  signUp,
} from '../../data/supabase-client';
import s from './LoginDialog.module.css';

const PW_MIN = 6;

export function LoginDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>, okMsg?: string) {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await fn();
      if (okMsg) setOk(okMsg);
      else onClose();
    } catch (e) {
      setErr((e as Error).message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  function loginPw() {
    if (!email || !password) {
      setErr('请输入邮箱和密码');
      return;
    }
    void run(() => signInWithPassword(email, password));
  }

  function register() {
    if (!email || !password) {
      setErr('请输入邮箱和密码');
      return;
    }
    if (password.length < PW_MIN) {
      setErr(`密码至少 ${PW_MIN} 位`);
      return;
    }
    void run(() => signUp(email, password), '注册成功，现在用同一邮箱登录即可');
  }

  function anon() {
    void run(() => signInAnonymously());
  }

  function otp() {
    if (!email) {
      setErr('请输入邮箱');
      return;
    }
    void run(() => signInWithOtp(email), '登录链接已发送到邮箱，打开后刷新本页即可');
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.card} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className={s.close} onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 className={s.title}>{mode === 'signin' ? '登录云端' : '创建账号'}</h2>
        <p className={s.sub}>登录后行程与账本在所有设备同步</p>

        <label className={s.label}>邮箱</label>
        <input
          className="field"
          type="email"
          placeholder="you@mail.com"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (mode === 'signin' ? loginPw() : register())}
        />

        <label className={s.label}>密码</label>
        <input
          className="field"
          type="password"
          placeholder={mode === 'signup' ? `至少 ${PW_MIN} 位` : '密码'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (mode === 'signin' ? loginPw() : register())}
        />

        {err && <div className={s.err}>{err}</div>}
        {ok && <div className={s.ok}>{ok}</div>}

        <button className={`btn btn-primary ${s.full}`} disabled={busy} onClick={mode === 'signin' ? loginPw : register}>
          {mode === 'signin' ? '登录' : '注册'}
        </button>

        <div className={s.switch}>
          {mode === 'signin' ? (
            <>
              还没有账号？<button className={s.link} onClick={() => setMode('signup')}>注册一个</button>
            </>
          ) : (
            <>
              已有账号？<button className={s.link} onClick={() => setMode('signin')}>去登录</button>
            </>
          )}
        </div>

        <div className={s.alt}>
          <button className={s.link} onClick={anon}>
            匿名快速体验
          </button>
          <button className={s.link} onClick={otp}>
            邮箱魔法链接
          </button>
        </div>
      </div>
    </div>
  );
}
