/**
 * Supabase 客户端单例与认证集成点。
 *
 * 为什么必须有登录态：supabase/migrations/0001_init.sql 的全部 RLS 策略都基于
 * `auth.uid()`（见 is_trip_member / is_trip_owner）。匿名或未登录（anon）角色对
 * trips 等表没有任何写权限，所以云端模式要可用，**必须先登录**。
 *
 * 本模块提供：
 *   - `supabase`：配置就绪时的客户端单例；未配置时为 null（视图层据此走本地档）
 *   - `isSupabaseConfigured()`：工厂用它决定返回哪个 adapter
 *   - `useSession()`：React hook，监听登录态（SSR 安全，无配置时直接返回未登录）
 *   - 登录辅助：匿名登录（零配置、最省事）/ 邮箱+密码（正常账号）/ 邮箱 OTP（需后台配邮件）/ 登出
 */
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(URL) && Boolean(ANON);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(URL!, ANON!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // HashRouter 下 URL 形如 `/#/...`，关闭自动解析避免与前端路由互相干扰；
        // 匿名登录不需要它，邮箱 OTP 回跳后手动刷新即可。
        detectSessionInUrl: false,
      },
    })
  : null;

export interface SessionState {
  loading: boolean;
  session: Session | null;
  user: User | null;
}

/**
 * 监听 Supabase 登录态。未配置 Supabase 时同步返回「未登录、非加载」，不订阅。
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: isSupabaseConfigured,
    session: null,
    user: null,
  });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState({ loading: false, session: data.session, user: data.session?.user ?? null });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, session, user: session?.user ?? null });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** 匿名登录：Supabase 后台需开启 "Anonymous sign-ins"。零邮件配置即可用，RLS 拿到真实 uid。 */
export async function signInAnonymously(): Promise<void> {
  if (!supabase) throw new Error('Supabase 未配置');
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

/** 邮箱魔法链接登录：需 Supabase 后台配置邮件服务商。回跳后刷新页面完成登录。 */
export async function signInWithOtp(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase 未配置');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/#/` },
  });
  if (error) throw error;
}

/** 邮箱+密码注册。后台 Email provider 需开启「Email/Password」。若开启确认邮件，注册后需查收确认信再登录。 */
export async function signUp(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Supabase 未配置');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

/** 邮箱+密码登录。后台 Email provider 需开启「Email/Password」。 */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Supabase 未配置');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
