/**
 * 世界库 adapter · 静态 JSON（M1–M5 默认）。
 *
 * 数据来自 public/data/，由 scripts/build-index.ts 从 content/ 编译而来。
 * 全部内容是不可变的静态资源，因此在内存里做永久缓存，并用 safeParse 容错：
 * 单个 POI 结构异常时降级为"这张卡打不开"，不能让整个应用白屏。
 */
import { CitySchema, CountrySchema, PoiSchema, type City, type Country, type Poi } from '../../domain/world/schema';
import type {
  CitySummary,
  CountrySummary,
  PoiQuery,
  PoiSummary,
  SearchHit,
  WorldIndex,
  WorldRepository,
} from '../types';

const BASE = `${import.meta.env.BASE_URL ?? '/'}data`.replace(/\/{2,}/g, '/');

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`世界库资源缺失：${path}（${res.status}）。先跑 npm run content:build`);
  return (await res.json()) as T;
}

function memo<T>(fn: (key: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    const hit = cache.get(key);
    if (hit) return hit;
    const p = fn(key).catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
    return p;
  };
}

interface SearchRecord {
  id: string;
  kind: 'city' | 'poi';
  text: string;
  city?: string;
}

export class StaticJsonWorldRepository implements WorldRepository {
  private indexPromise: Promise<WorldIndex> | null = null;
  private searchPromise: Promise<SearchRecord[]> | null = null;
  private aliasPromise: Promise<Record<string, string>> | null = null;

  private loadCountry = memo<Country | null>(async (id) => {
    const raw = await getJson<unknown>(`/country/${id}.json`).catch(() => null);
    if (!raw) return null;
    const r = CountrySchema.safeParse(raw);
    return r.success ? r.data : null;
  });

  private loadCity = memo<City | null>(async (id) => {
    const raw = await getJson<unknown>(`/city/${id}.json`).catch(() => null);
    if (!raw) return null;
    const r = CitySchema.safeParse(raw);
    return r.success ? r.data : null;
  });

  private loadPoi = memo<Poi | null>(async (id) => {
    const raw = await getJson<unknown>(`/poi/${id}.json`).catch(() => null);
    if (!raw) return null;
    const r = PoiSchema.safeParse(raw);
    if (!r.success) {
      console.warn(`[world] POI ${id} 结构异常，已降级`, r.error.issues.slice(0, 3));
      return null;
    }
    return r.data;
  });

  getIndex(): Promise<WorldIndex> {
    this.indexPromise ??= getJson<WorldIndex>('/index.json');
    return this.indexPromise;
  }

  async listCountries(): Promise<CountrySummary[]> {
    return (await this.getIndex()).countries;
  }

  async getCountry(id: string): Promise<Country | null> {
    return this.loadCountry(id);
  }

  async listCities(countryId?: string): Promise<CitySummary[]> {
    const { cities } = await this.getIndex();
    return countryId ? cities.filter((c) => c.country === countryId) : cities;
  }

  async getCity(id: string): Promise<City | null> {
    return this.loadCity(id);
  }

  async listPois(q: PoiQuery = {}): Promise<PoiSummary[]> {
    const index = await this.getIndex();
    const { pois } = index;
    const kw = q.keyword?.trim().toLowerCase();
    let out = pois;

    if (q.cityId) out = out.filter((p) => p.city === q.cityId);
    if (q.types?.length) out = out.filter((p) => q.types!.includes(p.type));
    if (q.tags?.length) out = out.filter((p) => q.tags!.some((t) => p.tags.includes(t)));
    if (q.excludeTags?.length) {
      out = out.filter((p) => !q.excludeTags!.some((t) => p.tags.includes(t)));
    }
    if (kw) {
      const city = new Map(index.cities.map((c) => [c.id, c]));
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(kw) ||
          p.localName.toLowerCase().includes(kw) ||
          p.tags.some((t) => t.toLowerCase().includes(kw)) ||
          city.get(p.city)?.name.toLowerCase().includes(kw) ||
          city.get(p.city)?.localName.toLowerCase().includes(kw),
      );
    }

    return q.sort === 'name'
      ? [...out].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      : [...out].sort((a, b) => b.popularity - a.popularity);
  }

  async getPoi(id: string): Promise<Poi | null> {
    const direct = await this.loadPoi(id);
    if (direct) return direct;
    // 走别名重定向，保证老行程引用的旧 id 不断链
    this.aliasPromise ??= getJson<Record<string, string>>('/aliases.json').catch(() => ({}));
    const aliases = await this.aliasPromise;
    const target = aliases[id];
    return target ? this.loadPoi(target) : null;
  }

  async getPois(ids: string[]): Promise<Record<string, Poi>> {
    const uniq = [...new Set(ids)];
    const entries = await Promise.all(
      uniq.map(async (id) => [id, await this.getPoi(id)] as const),
    );
    const out: Record<string, Poi> = {};
    for (const [id, poi] of entries) if (poi) out[id] = poi;
    return out;
  }

  async search(keyword: string): Promise<SearchHit[]> {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return [];
    this.searchPromise ??= getJson<SearchRecord[]>('/search.json');
    const [records, index] = await Promise.all([this.searchPromise, this.getIndex()]);
    const cityName = new Map(index.cities.map((c) => [c.id, c.name]));

    return records
      .filter((r) => r.text.toLowerCase().includes(kw))
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.text.split(' ')[0] ?? r.text,
        subtitle: r.kind === 'city' ? '城市' : (cityName.get(r.city ?? '') ?? 'POI'),
      }));
  }
}
