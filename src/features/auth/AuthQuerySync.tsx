/**
 * 登录态 ↔ 行程查询同步。
 *
 * 痛点：Repository 工厂只在「是否配置了 Supabase」时决定用云端适配器，
 * 与登录态无关。所以未登录时点进应用，trip 查询已用「无会话」跑过一次
 * （RLS 挡掉，结果为空/报错并被缓存）。此时点「登录云端」只是拿到会话，
 * 但若不主动失效查询，列表会一直停在登录前的陈旧结果——看起来像没生效。
 *
 * 这里订阅 auth 变化，登录/登出后立即失效 ['trip'] 分组，强制重拉。
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../data/supabase-client';

export function AuthQuerySync() {
  const { session, loading } = useSession();
  const qc = useQueryClient();

  useEffect(() => {
    if (loading) return;
    // session 变化（登录成功拿到 uid / 登出清空）即失效 trip 全部查询，用新会话重拉
    void qc.invalidateQueries({ queryKey: ['trip'] });
  }, [session, loading, qc]);

  return null;
}
