/**
 * 右栏「谁想去」面板 —— 把时间线上折叠成一排圈圈的投票摊开成实名清单。
 *
 * 投票本来就是实名的（item_votes 记 member_id），这里只是把它显示出来：
 * 想去的、不太想的、还没表态的分三行列清楚，出行前催票不用再挨个问。
 */
import type { TripBundle, TripItem, TripMember } from '../../data/types';
import { MemberAvatar } from './MemberAvatar';
import { useMyMember } from './useMyMember';
import type { useTripMutations } from './queries';
import s from './VotePanel.module.css';

type Mutations = ReturnType<typeof useTripMutations>;

export function VotePanel({
  item,
  bundle,
  mut,
}: {
  item: TripItem;
  bundle: TripBundle;
  mut: Mutations;
}) {
  const me = useMyMember(bundle.members);
  const votes = bundle.votes.filter((v) => v.itemId === item.id);
  const valueOf = (m: TripMember) => votes.find((v) => v.memberId === m.id)?.value ?? 0;

  const up = bundle.members.filter((m) => valueOf(m) === 1);
  const down = bundle.members.filter((m) => valueOf(m) === -1);
  const silent = bundle.members.filter((m) => valueOf(m) === 0);
  const myVote = me ? valueOf(me) : 0;

  function cast(value: 1 | -1) {
    if (!me) return;
    mut.vote.mutate({ itemId: item.id, memberId: me.id, value: myVote === value ? 0 : value });
  }

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.title}>谁想去</span>
        <span className={s.score}>
          净分 <b className="num">{up.length - down.length}</b>
        </span>
      </div>

      <div className={s.myRow}>
        <span className={s.myLabel}>我的表态</span>
        <button
          className={`${s.btn} ${myVote === 1 ? s.btnUp : ''}`}
          onClick={() => cast(1)}
          disabled={!me}
        >
          ▲ 想去
        </button>
        <button
          className={`${s.btn} ${myVote === -1 ? s.btnDown : ''}`}
          onClick={() => cast(-1)}
          disabled={!me}
        >
          ▼ 不太想
        </button>
      </div>

      <Line label="想去" tone="up" members={up} meId={me?.id} />
      <Line label="不太想" tone="down" members={down} meId={me?.id} />
      <Line label="还没表态" tone="none" members={silent} meId={me?.id} muted />
    </div>
  );
}

function Line({
  label,
  tone,
  members,
  meId,
  muted,
}: {
  label: string;
  tone: 'up' | 'down' | 'none';
  members: TripMember[];
  meId?: string;
  muted?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <div className={`${s.line} ${muted ? s.lineMuted : ''}`}>
      <span className={s.lineLabel}>
        {label} <span className="num">{members.length}</span>
      </span>
      <div className={s.people}>
        {members.map((m) => (
          <span key={m.id} className={s.person}>
            <MemberAvatar member={m} size={20} tone={tone} me={m.id === meId} />
            <span className={s.name}>
              {m.displayName}
              {m.id === meId && <span className={s.meTag}>我</span>}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
