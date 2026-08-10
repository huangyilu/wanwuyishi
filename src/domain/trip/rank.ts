/**
 * Fractional index（分数序）—— 拖拽排序的排序键。
 *
 * 为什么不用整数 position：拖动一个条目需要重写它后面所有条目的序号，
 * 一次拖拽变成 N 次 UPDATE，且两人同时拖会互相覆盖。
 * 分数序只写被拖动的那一行，天然抗并发。
 *
 * 实现思路（与 Figma 公开的做法一致）：把 rank 看作省略了 "0." 的 base62 小数，
 * 求两个值的中点。不变量：rank 末位永远不是最小字符 '0'，否则无法在它之前插值。
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length; // 62

function digit(ch: string | undefined, fallback: number): number {
  if (ch === undefined) return fallback;
  const i = DIGITS.indexOf(ch);
  if (i < 0) throw new Error(`rank 含非法字符：${ch}`);
  return i;
}

/** a 为 '' 表示最小端，b 为 null 表示最大端；要求 a < b */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`rank 中点要求 a < b，收到 a="${a}" b="${b}"`);
  }
  if (a.endsWith('0') || (b !== null && b.endsWith('0'))) {
    throw new Error('rank 末位不允许为 "0"（会破坏可插值不变量）');
  }

  if (b !== null) {
    // 剥离公共前缀后递归
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const da = a.length > 0 ? digit(a[0], 0) : 0;
  const db = b !== null ? digit(b[0], BASE) : BASE;

  if (db - da > 1) {
    return DIGITS[Math.round(0.5 * (da + db))]!;
  }

  // 首位相邻：借 b 的下一位
  if (b !== null && b.length > 1) return b.slice(0, 1);

  // b 已到尽头，沿用 a 的首位继续往后找
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

/**
 * 取 a 与 b 之间的一个 rank。
 * a 为 null 表示"插到最前面"，b 为 null 表示"插到最后面"。
 * 保证 a < result < b。
 */
export function rankBetween(a: string | null, b: string | null): string {
  return midpoint(a ?? '', b);
}

/** 列表第一个条目的 rank */
export function initialRank(): string {
  return rankBetween(null, null); // 'V'，居中，方便向两边插
}

/** 一次性生成 n 个递增 rank（导入行程 / 无脑跟随复制时用） */
export function sequentialRanks(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const r = rankBetween(prev, null);
    out.push(r);
    prev = r;
  }
  return out;
}

export function byRank<T extends { rank: string }>(a: T, b: T): number {
  return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
}

/**
 * 拖拽落位后计算新 rank。
 * items 为目标容器内已按 rank 排序、且已移除被拖动项的列表；toIndex 为落位下标。
 */
export function rankForInsert(items: Array<{ rank: string }>, toIndex: number): string {
  const before = toIndex > 0 ? items[toIndex - 1]?.rank ?? null : null;
  const after = items[toIndex]?.rank ?? null;
  return rankBetween(before, after);
}
