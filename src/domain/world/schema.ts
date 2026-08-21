/**
 * Tour the World · 世界库 schema
 *
 * 这是世界库的唯一事实来源：
 *   1. TypeScript 类型          →  z.infer
 *   2. CI 内容校验              →  scripts/validate-content.ts
 *   3. 运行时容错解析            →  safeParse（结构异常时降级渲染而非白屏）
 *
 * 设计约束（见 docs/技术方案.md 4.1）：
 *   - 字段结构按未来的数据库表设计，M6 入库时只需一个导入脚本
 *   - 一切"会变"的信息必须携带 source + verifiedAt
 *   - 闭馆日、游览时长、预约提前期必须结构化（算法依赖，不能是自然语言）
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* 公共                                                                */
/* ------------------------------------------------------------------ */

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须为 YYYY-MM-DD');

export const HttpsUrl = z.string().url().startsWith('https://', '来源链接必须为 https');

/** 易变字段：值 + 官方来源 + 核实时间，三者缺一不可 */
export const Verifiable = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    source: HttpsUrl,
    verifiedAt: IsoDate,
  });

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/* ------------------------------------------------------------------ */
/* Country                                                             */
/* ------------------------------------------------------------------ */

export const VisaInfoSchema = z.object({
  /** 同一签证区共享一张卡，如 "schengen" */
  visaArea: z.string().optional(),
  type: z.string(),
  applyChannel: z.string(),
  materials: z.array(z.string()).min(1),
  fee: Verifiable(z.string()),
  processingDays: Verifiable(z.string()),
  /** 最早可递签：出发前 N 天 */
  earliestApplyDays: z.number().int().positive(),
  /** 建议最晚递签：出发前 N 天（驱动倒计时告警） */
  latestApplyDays: z.number().int().positive(),
  notes: z.array(z.string()).default([]),
});

export const CountrySchema = z.object({
  id: z.string().regex(/^[a-z]{2}$/, '国家 id 用 ISO 3166-1 alpha-2 小写'),
  name: z.string(),
  localName: z.string(),
  currency: z.string().length(3),
  languages: z.array(z.string()).min(1),
  timezone: z.string(),
  plugTypes: z.array(z.string()).default([]),
  emergencyNumbers: z.record(z.string()).default({}),
  tipping: z.string().optional(),
  visa: VisaInfoSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* City                                                                */
/* ------------------------------------------------------------------ */

export const SurvivalTopicSchema = z.object({
  topic: z.enum([
    'toilet', 'wifi', 'water', 'tipping', 'safety',
    'transport', 'payment', 'language', 'other',
  ]),
  summary: z.string().min(1),
  tips: z.array(z.string()).default([]),
  source: HttpsUrl,
  verifiedAt: IsoDate,
});

export const TransitPassSchema = z.object({
  name: z.string(),
  scope: z.string(),
  benefits: z.array(z.string()).default([]),
  price: Verifiable(z.string()).optional(),
  url: HttpsUrl.optional(),
});

export const CitySchema = z.object({
  id: z.string().regex(/^city-[a-z0-9-]+$/),
  name: z.string(),
  localName: z.string(),
  country: z.string().regex(/^[a-z]{2}$/),
  location: LatLng,
  timezone: z.string(),
  survival: z.array(SurvivalTopicSchema).default([]),
  transitPasses: z.array(TransitPassSchema).default([]),
});

/* ------------------------------------------------------------------ */
/* POI                                                                 */
/* ------------------------------------------------------------------ */

export const PoiType = z.enum([
  'museum', 'landmark', 'park', 'viewpoint', 'church',
  'market', 'restaurant', 'station', 'facility', 'other',
]);

/** 开放性：闭馆日校验（无脑跟随的招牌能力）完全依赖这个对象 */
export const OpennessSchema = z.object({
  /** 0=周日 … 6=周六 */
  closedWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
  /** 固定闭馆日，YYYY-MM-DD */
  closedDates: z.array(IsoDate).default([]),
  /** 季节性开放区间（MM-DD），区间之外视为不开放 */
  seasonal: z
    .array(
      z.object({
        from: z.string().regex(/^\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{2}-\d{2}$/),
        note: z.string(),
      }),
    )
    .default([]),
});

export const GuideSchema = z.object({
  entrances: z.string().optional(),
  routes: z
    .array(
      z.object({
        name: z.string(),
        durationMinutes: z.number().int().positive().optional(),
        stops: z.array(z.string()).min(1),
      }),
    )
    .default([]),
  highlights: z
    .array(
      z.object({
        name: z.string(),
        /** 精确到展厅/馆翼——这是深导览区别于普通攻略的核心 */
        location: z.string().min(1),
        why: z.string().optional(),
      }),
    )
    .default([]),
  collections: z.string().optional(),
  tips: z.array(z.string()).default([]),
});

export const PoiSchema = z.object({
  id: z.string().regex(/^poi-[a-z0-9-]+$/),
  /** 曾用 id，重命名后用于重定向，保证老行程不断链 */
  aliases: z.array(z.string()).default([]),
  type: PoiType,
  name: z.string(),
  localName: z.string(),
  city: z.string().regex(/^city-[a-z0-9-]+$/),
  country: z.string().regex(/^[a-z]{2}$/),
  location: LatLng,
  tags: z.array(z.string()).default([]),
  popularity: z.number().int().min(0).max(100),

  wikidataId: z.string().regex(/^Q\d+$/).optional(),
  officialUrl: HttpsUrl.optional(),

  visit: z.object({
    /** [下限, 上限] 分钟，供"一天排太满"体检运算 */
    durationMinutes: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    /** 展示用文案，如 "3-4小时（精华）/ 半天+（细逛）" */
    durationNote: z.string().optional(),
    bestTime: z.string().optional(),
  }),

  openness: OpennessSchema.default({ closedWeekdays: [], closedDates: [], seasonal: [] }),

  booking: z
    .object({
      required: z.boolean(),
      /** 建议提前 N 天预约 → 驱动"该订票了"提醒 */
      leadDays: z.number().int().min(0),
      url: HttpsUrl.optional(),
    })
    .optional(),

  facilities: z
    .object({
      toilet: z.string().optional(),
      wifi: z.string().optional(),
      locker: z.string().optional(),
      water: z.string().optional(),
      accessible: z.boolean().optional(),
    })
    .optional(),

  volatile: z.object({
    price: Verifiable(z.string()).optional(),
    hours: Verifiable(z.string()).optional(),
    booking: Verifiable(z.string()).optional(),
  }),

  guide: GuideSchema.optional(),

  /** 仅允许自由版权图源（Wikimedia Commons），必须署名 */
  image: z
    .object({ url: HttpsUrl, credit: z.string().min(1), license: z.string().min(1) })
    .optional(),

  /* 编著期字段：build-index 时剥离，不进运行时数据 */
  _todo: z.array(z.string()).optional(),
  _sources: z.array(z.string()).optional(),
});

/* ------------------------------------------------------------------ */
/* 派生类型                                                            */
/* ------------------------------------------------------------------ */

export type Country = z.infer<typeof CountrySchema>;
export type VisaInfo = z.infer<typeof VisaInfoSchema>;
export type City = z.infer<typeof CitySchema>;
export type SurvivalTopic = z.infer<typeof SurvivalTopicSchema>;
export type Poi = z.infer<typeof PoiSchema>;
export type Guide = z.infer<typeof GuideSchema>;
export type Openness = z.infer<typeof OpennessSchema>;
export type PoiTypeName = z.infer<typeof PoiType>;

/** 列表页与地图用的精简投影，由 build-index.ts 生成 */
export const PoiSummarySchema = PoiSchema.pick({
  id: true, type: true, name: true, localName: true, city: true,
  country: true, location: true, tags: true, popularity: true,
}).extend({
  closedWeekdays: z.array(z.number().int()).default([]),
  hasGuide: z.boolean().default(false),
  durationMinutes: z.tuple([z.number(), z.number()]),
});
export type PoiSummary = z.infer<typeof PoiSummarySchema>;

/* ------------------------------------------------------------------ */
/* 业务规则校验（结构合法之外的额外门禁，供 CI 调用）                    */
/* ------------------------------------------------------------------ */

export interface ContentIssue {
  file: string;
  level: 'error' | 'warn';
  message: string;
}

/** 国家边界框，用于低成本发现经纬度写反 */
const BBOX: Record<string, [number, number, number, number]> = {
  // [minLat, maxLat, minLng, maxLng]
  fr: [41.3, 51.1, -5.2, 9.6],
  it: [35.4, 47.1, 6.6, 18.6],
  ch: [45.8, 47.9, 5.9, 10.5],
  eg: [22.0, 31.8, 25.0, 34.9],
};

export function checkPoiRules(poi: Poi, ctx: {
  file: string;
  cityIds: Set<string>;
  countryIds: Set<string>;
  today: string;
}): ContentIssue[] {
  const out: ContentIssue[] = [];
  const err = (m: string) => out.push({ file: ctx.file, level: 'error', message: m });
  const warn = (m: string) => out.push({ file: ctx.file, level: 'warn', message: m });

  if (!ctx.cityIds.has(poi.city)) err(`引用了不存在的城市 ${poi.city}`);
  if (!ctx.countryIds.has(poi.country)) err(`引用了不存在的国家 ${poi.country}`);

  const box = BBOX[poi.country];
  if (box) {
    const [minLat, maxLat, minLng, maxLng] = box;
    const { lat, lng } = poi.location;
    if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
      err(`坐标 (${lat}, ${lng}) 不在 ${poi.country} 境内，检查是否经纬度写反`);
    }
  }

  const [lo, hi] = poi.visit.durationMinutes;
  if (lo > hi) err(`游览时长区间颠倒：[${lo}, ${hi}]`);

  // 重点博物馆必须有深导览
  if (poi.type === 'museum' && poi.popularity >= 80 && !poi.guide) {
    err('热度 ≥ 80 的博物馆必须配备 guide 深导览');
  }
  if (poi.guide) {
    poi.guide.highlights.forEach((h, i) => {
      if (!h.location.trim()) err(`guide.highlights[${i}] 缺少展厅位置`);
    });
  }

  // 易变字段时效
  for (const [key, v] of Object.entries(poi.volatile)) {
    if (!v) continue;
    if (v.verifiedAt > ctx.today) err(`volatile.${key}.verifiedAt 晚于今天`);
    if (daysBetween(v.verifiedAt, ctx.today) > 180) {
      warn(`volatile.${key} 已超过 180 天未核实（${v.verifiedAt}）`);
    }
  }

  if (poi._todo?.length) warn(`仍有 ${poi._todo.length} 项待人工核实`);

  return out;
}

/** 纯字符串日期差（避免 Date 的时区陷阱，见技术方案 4.3） */
export function daysBetween(from: string, to: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(to) - d(from)) / 86_400_000);
}
