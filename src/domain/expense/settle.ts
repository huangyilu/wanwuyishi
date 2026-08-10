/**
 * 账本：分摊与"最少转账次数"结算。
 *
 * 两条铁律：
 *   1. 金额一律用整数分（cents）运算。浮点数在几十笔累加后会出现 0.01 的漂移，
 *      账本算错等于产品失信。
 *   2. 结算主体是 trip_members.id 而非 user_id —— 幽灵成员必须能被记账与被结算。
 */

export interface ExpenseInput {
  id: string;
  /** 已换算到行程基准币种的整数分 */
  amountCents: number;
  payerMemberId: string;
  /** 'aa' = 纳入共同分摊；'personal' = 个人自付，结算时直接跳过 */
  splitMode: 'aa' | 'personal';
  /** 参与人及权重，权重默认为 1；空数组表示全员均摊由调用方展开 */
  shares: Array<{ memberId: string; weight: number }>;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export interface SettlementResult {
  /** 每人净额：正数表示别人欠他，负数表示他欠别人 */
  balances: Record<string, number>;
  transfers: Transfer[];
  totalCents: number;
}

/**
 * 按权重把一笔钱拆给参与人，用最大余数法保证分摊后的和恰好等于原额。
 * 例：100 分 3 人均摊 → 34 / 33 / 33，而不是三个 33 少 1 分。
 */
export function splitAmount(
  amountCents: number,
  shares: Array<{ memberId: string; weight: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (shares.length === 0) return out;

  const totalWeight = shares.reduce((s, x) => s + x.weight, 0);
  if (totalWeight <= 0) return out;

  const exact = shares.map((s) => ({
    memberId: s.memberId,
    raw: (amountCents * s.weight) / totalWeight,
  }));
  let assigned = 0;
  for (const e of exact) {
    const floor = Math.floor(e.raw);
    out[e.memberId] = (out[e.memberId] ?? 0) + floor;
    assigned += floor;
  }

  // 余数按小数部分从大到小分配，保证总和守恒
  let remainder = amountCents - assigned;
  const byFraction = [...exact].sort((a, b) => (b.raw % 1) - (a.raw % 1));
  let i = 0;
  while (remainder > 0 && byFraction.length > 0) {
    const target = byFraction[i % byFraction.length]!;
    out[target.memberId] = (out[target.memberId] ?? 0) + 1;
    remainder--;
    i++;
  }
  return out;
}

export function computeBalances(expenses: ExpenseInput[]): Record<string, number> {
  const balances: Record<string, number> = {};
  const bump = (id: string, delta: number) => {
    balances[id] = (balances[id] ?? 0) + delta;
  };

  for (const e of expenses) {
    // 个人自付不进入共同分摊：不记付款人贷方、也不产生扣减
    if (e.splitMode === 'personal') continue;
    bump(e.payerMemberId, e.amountCents);
    const split = splitAmount(e.amountCents, e.shares);
    for (const [memberId, owed] of Object.entries(split)) bump(memberId, -owed);
  }
  return balances;
}

/**
 * 贪心结算：每次让"欠最多的人"直接还给"被欠最多的人"。
 * 对 2-10 人的旅行场景，贪心结果与最优解一致的概率极高，
 * 且转账次数上限为 n-1，足够满足"少转几次账"的真实诉求。
 */
export function minimalTransfers(balances: Record<string, number>): Transfer[] {
  const debtors: Array<{ id: string; amount: number }> = [];
  const creditors: Array<{ id: string; amount: number }> = [];

  for (const [id, v] of Object.entries(balances)) {
    if (v < 0) debtors.push({ id, amount: -v });
    else if (v > 0) creditors.push({ id, amount: v });
  }
  // 排序保证结果稳定可复现（便于单测与"结算方案没变"的判断）
  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d.amount, c.amount);
    if (amount > 0) {
      transfers.push({ fromMemberId: d.id, toMemberId: c.id, amountCents: amount });
      d.amount -= amount;
      c.amount -= amount;
    }
    if (d.amount === 0) i++;
    if (c.amount === 0) j++;
  }
  return transfers;
}

export function settle(expenses: ExpenseInput[]): SettlementResult {
  const balances = computeBalances(expenses);
  return {
    balances,
    transfers: minimalTransfers(balances),
    totalCents: expenses.reduce((s, e) => s + e.amountCents, 0),
  };
}

/** 展示用：整数分 → "¥1,234.50" */
export function formatMoney(cents: number, currency = 'CNY'): string {
  const symbol: Record<string, string> = { CNY: '¥', EUR: '€', CHF: 'CHF ', USD: '$' };
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const main = Math.floor(abs / 100).toLocaleString('zh-CN');
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${symbol[currency] ?? `${currency} `}${main}.${frac}`;
}
