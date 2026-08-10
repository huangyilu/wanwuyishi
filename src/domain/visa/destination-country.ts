/**
 * 送签国判断 —— 结构化行程数据的零成本红利。
 *
 * 申根规则：向"主要目的地国"递交，即停留晚数最多的国家；
 * 若多国晚数相同，则向首个入境国递交。
 *
 * 输入是已经排好的行程天，输出直接是一句可执行的结论。
 */

export interface CountedDay {
  date: string;
  countryId: string | null;
}

export interface VisaDecision {
  countryId: string | null;
  nightsByCountry: Array<{ countryId: string; nights: number }>;
  /** 是否因并列而回落到"首个入境国"规则 */
  tiedByFirstEntry: boolean;
  reason: string;
}

/**
 * 晚数口径：行程中每一天（住宿夜）归属其所在国家。
 * 最后一天若为离境日则不计入 —— 由调用方决定是否传入，这里只按传入的天计算。
 */
export function decideVisaCountry(
  days: CountedDay[],
  countryNames: Record<string, string> = {},
): VisaDecision {
  const nights = new Map<string, number>();
  const firstSeen = new Map<string, string>();

  for (const d of days) {
    if (!d.countryId) continue;
    nights.set(d.countryId, (nights.get(d.countryId) ?? 0) + 1);
    if (!firstSeen.has(d.countryId)) firstSeen.set(d.countryId, d.date);
  }

  const ranked = [...nights.entries()]
    .map(([countryId, n]) => ({ countryId, nights: n }))
    .sort(
      (a, b) =>
        b.nights - a.nights ||
        (firstSeen.get(a.countryId)! < firstSeen.get(b.countryId)! ? -1 : 1),
    );

  const name = (id: string) => countryNames[id] ?? id.toUpperCase();

  if (ranked.length === 0) {
    return {
      countryId: null,
      nightsByCountry: [],
      tiedByFirstEntry: false,
      reason: '行程还没有排入任何国家的日期，无法判断送签国。',
    };
  }

  const top = ranked[0]!;
  const tied = ranked.filter((r) => r.nights === top.nights);
  const tiedByFirstEntry = tied.length > 1;

  const detail = ranked.map((r) => `${name(r.countryId)} ${r.nights} 晚`).join(' · ');

  return {
    countryId: top.countryId,
    nightsByCountry: ranked,
    tiedByFirstEntry,
    reason: tiedByFirstEntry
      ? `${tied.map((t) => name(t.countryId)).join('、')}停留晚数相同（各 ${top.nights} 晚），` +
        `按"首个入境国"规则应向${name(top.countryId)}递签。（${detail}）`
      : `停留最久的是${name(top.countryId)}（${top.nights} 晚），应向${name(top.countryId)}使领馆递签。（${detail}）`,
  };
}

/* ------------------------------------------------------------------ */
/* 签证行程单：递签材料里最常被要求的那张表                              */
/* ------------------------------------------------------------------ */

export interface ItinerarySheetRow {
  date: string;
  city: string;
  country: string;
  transport: string;
  accommodation: string;
  address: string;
}

export interface ItinerarySheetInput {
  days: Array<{
    date: string;
    cityName: string | null;
    countryName: string | null;
  }>;
  transports: Array<{ date: string; text: string }>;
  accommodations: Array<{ date: string; name: string; address: string }>;
}

/** 把行程时间线编译成使馆要求的行程单表格（日期 / 城市 / 交通 / 住宿） */
export function buildItinerarySheet(input: ItinerarySheetInput): ItinerarySheetRow[] {
  const transportByDate = new Map<string, string[]>();
  for (const t of input.transports) {
    transportByDate.set(t.date, [...(transportByDate.get(t.date) ?? []), t.text]);
  }
  const stayByDate = new Map(input.accommodations.map((a) => [a.date, a]));

  return input.days.map((d) => {
    const stay = stayByDate.get(d.date);
    return {
      date: d.date,
      city: d.cityName ?? '—',
      country: d.countryName ?? '—',
      transport: (transportByDate.get(d.date) ?? []).join('；') || '市内交通',
      accommodation: stay?.name ?? '—',
      address: stay?.address ?? '—',
    };
  });
}
