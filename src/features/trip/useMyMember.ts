/**
 * 「我在这趟行程里是哪个成员」的唯一判定口。
 *
 * 之前各处直接写 `members.find(m => m.role === 'owner')`，在单机时代没问题，
 * 但协作上线后就错了：朋友登录进来，"我"仍被判成创建者，
 * 于是他的票会写到创建者的 member_id 上，并把创建者原来的票覆盖掉
 * （item_votes 有 unique(item_id, member_id)）。投票、记账、打包负责人都吃这个亏。
 *
 * 正确口径：拿 auth 的 user.id 去 trip_members.user_id 匹配。
 * 匹配不到时才降级到 owner —— 覆盖本地模式（没有登录态）和数据异常两种情况。
 */
import { useMemo } from 'react';
import { useSession } from '../../data/supabase-client';
import type { TripMember } from '../../data/types';

export function pickMyMember(
  members: TripMember[],
  userId: string | null | undefined,
): TripMember | undefined {
  if (userId) {
    const mine = members.find((m) => m.userId === userId);
    if (mine) return mine;
  }
  return members.find((m) => m.role === 'owner') ?? members[0];
}

/** 返回我在该行程中的成员记录；未登录 / 本地模式降级为 owner */
export function useMyMember(members: TripMember[]): TripMember | undefined {
  const { user } = useSession();
  return useMemo(() => pickMyMember(members, user?.id), [members, user?.id]);
}
