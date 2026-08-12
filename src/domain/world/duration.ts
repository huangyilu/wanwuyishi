/**
 * 景点时长展示格式化。
 *
 * 原始数据是一对分钟区间 [lo, hi]（如 [90, 120]）。直接 `lo/60 - hi/60` 四舍五入会出现
 * 「0-0 小时」（小于 30 分钟被舍成 0）、「1-1 小时」（上下界相同却还显示区间）等不自然文案。
 * 这里统一处理：不足 1 小时用分钟、上下界相同只显示一个值。
 */
export function formatDuration(min: [number, number]): string {
  const [lo, hi] = min;
  const h = (m: number) => {
    const v = m / 60;
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  };
  const m = (x: number) => String(Math.round(x));

  if (hi < 60) {
    return lo === hi ? `${m(lo)} 分钟` : `${m(lo)}-${m(hi)} 分钟`;
  }
  if (lo < 60) {
    return `${m(lo)} 分钟 - ${h(hi)} 小时`;
  }
  return lo === hi ? `${h(lo)} 小时` : `${h(lo)}-${h(hi)} 小时`;
}
