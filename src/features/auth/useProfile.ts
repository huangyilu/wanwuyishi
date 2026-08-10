/**
 * 读取 / 修改当前登录用户的 profiles.display_name。
 *
 * 为什么放在这里而不是 supabase-client：它依赖 react-query（全应用统一缓存层），
 * 而 supabase-client 只负责客户端单例与裸认证函数。
 *
 * RLS 已就绪：profiles 表的 p_profiles_self（for all using id = auth.uid()）允许本人读写，
 * 匿名用户同为 authenticated 角色，改自己的显示名也能过。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, useSession } from '../../data/supabase-client';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function useProfile() {
  const { user } = useSession();
  const userId = user?.id;

  const { data, isLoading } = useQuery<Profile | null>({
    // 把 userId 放进 key：登录态变化（含匿名→账号）时自动重取
    queryKey: ['profile', userId],
    enabled: !!supabase && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile) ?? null;
    },
  });

  return { profile: data ?? null, isLoading };
}

export function useUpdateDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (raw: string) => {
      const name = raw.trim();
      if (!name) throw new Error('名称不能为空');
      const { data: u } = await supabase!.auth.getUser();
      const user = u.user;
      if (!user) throw new Error('未登录');
      // upsert（onConflict id）确保即使 profile 行缺失也能建出来
      const { error } = await supabase!
        .from('profiles')
        .upsert({ id: user.id, display_name: name }, { onConflict: 'id' });
      if (error) throw error;
      // 别名是 profiles 表的全局名字；显示统一在 getBundle 时按 profiles 优先覆盖（含同伴），
      // 故此处无需回写 trip_members。
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      // 让所有行程的成员缓存刷新，账本 / 时间线立即按新别名展示
      qc.invalidateQueries({ queryKey: ['trip', 'bundle'] });
    },
  });
}
