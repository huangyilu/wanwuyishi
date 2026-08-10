/**
 * 成员头像圈圈 —— 投票实名化的视觉载体。
 *
 * 没有真实头像图（零成本约束下不做文件存储），用「首字母 + 稳定派生配色」的圆圈代替：
 * 同一个成员在任何地方都是同一个颜色，扫一眼就能认出是谁投的票、谁付的钱。
 *
 * 配色优先用 trip_members.color（未来允许手动指定），否则按成员 id 做 hash 落到手帐色板，
 * 保证同一行程内的人颜色分散且刷新后不变。
 */
import type { TripMember } from '../../data/types';
import s from './MemberAvatar.module.css';

/** 手帐风柔和色板：底色浅、文字深，浅色主题下都能读清 */
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#dfeae0', fg: '#33684a' }, // 苔绿
  { bg: '#f0e3cd', fg: '#8a6220' }, // 暖金
  { bg: '#dde6f0', fg: '#3a5f88' }, // 雾蓝
  { bg: '#f2ded9', fg: '#95452f' }, // 陶土
  { bg: '#e6e1ef', fg: '#5a4a80' }, // 藤紫
  { bg: '#dcebeb', fg: '#2f6b6b' }, // 青瓷
  { bg: '#f0e6da', fg: '#7d5a3a' }, // 牛皮纸
  { bg: '#e3e9dc', fg: '#4d6236' }, // 橄榄
];

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** 中文取首字，英文取首字母大写；空名兜底 ? */
export function initialOf(name: string): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const first = Array.from(t)[0]!;
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

export function memberColor(member: Pick<TripMember, 'id' | 'color'>): { bg: string; fg: string } {
  if (member.color) {
    // 自定义色只当底色，文字统一深墨，避免自选色和白字撞出低对比
    return { bg: member.color, fg: '#2c332f' };
  }
  return PALETTE[hashIndex(member.id, PALETTE.length)]!;
}

export type VoteTone = 'up' | 'down' | 'none';

export function MemberAvatar({
  member,
  size = 22,
  tone = 'none',
  me = false,
  title,
}: {
  member: TripMember;
  size?: number;
  /** up = 想去（绿环）；down = 不太想（红环 + 降饱和）；none = 中性 */
  tone?: VoteTone;
  /** 是不是我自己，加一圈品牌色描边区分 */
  me?: boolean;
  title?: string;
}) {
  const { bg, fg } = memberColor(member);
  const ghost = member.userId === null;
  return (
    <span
      className={[
        s.avatar,
        tone === 'up' ? s.up : '',
        tone === 'down' ? s.down : '',
        me ? s.me : '',
        ghost ? s.ghost : '',
      ].join(' ')}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.round(size * 0.46),
      }}
      title={title ?? member.displayName}
      aria-label={title ?? member.displayName}
    >
      {initialOf(member.displayName)}
    </span>
  );
}

/** 一排头像，超出 max 折叠成 +N */
export function AvatarStack({
  members,
  tone = 'none',
  max = 4,
  size = 22,
  meId,
  toneOf,
  labelOf,
}: {
  members: TripMember[];
  tone?: VoteTone;
  max?: number;
  size?: number;
  meId?: string | null;
  /** 逐个成员决定环色，优先级高于 tone */
  toneOf?: (m: TripMember) => VoteTone;
  /** 逐个成员定制 tooltip */
  labelOf?: (m: TripMember) => string;
}) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <span className={s.stack}>
      {shown.map((m) => (
        <MemberAvatar
          key={m.id}
          member={m}
          size={size}
          tone={toneOf ? toneOf(m) : tone}
          me={meId === m.id}
          title={labelOf ? labelOf(m) : undefined}
        />
      ))}
      {rest > 0 && (
        <span
          className={`${s.avatar} ${s.more}`}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
          title={members
            .slice(max)
            .map((m) => m.displayName)
            .join('、')}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
