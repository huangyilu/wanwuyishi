/**
 * content/ 目录的读取与解析，validate 与 build 共用。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CitySchema,
  CountrySchema,
  PoiSchema,
  type City,
  type Country,
  type Poi,
} from '../src/domain/world/schema.js';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const CONTENT_DIR = join(ROOT, 'content');
export const OUT_DIR = join(ROOT, 'public', 'data');

export interface ParseFailure {
  file: string;
  message: string;
}

export interface LoadResult {
  countries: Array<{ file: string; data: Country }>;
  cities: Array<{ file: string; data: City }>;
  pois: Array<{ file: string; data: Poi }>;
  failures: ParseFailure[];
}

function listJson(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

function rel(p: string): string {
  return p.slice(ROOT.length + 1);
}

export function loadContent(): LoadResult {
  const out: LoadResult = { countries: [], cities: [], pois: [], failures: [] };

  const groups = [
    { dir: join(CONTENT_DIR, 'countries'), schema: CountrySchema, bucket: 'countries' },
    { dir: join(CONTENT_DIR, 'cities'), schema: CitySchema, bucket: 'cities' },
    { dir: join(CONTENT_DIR, 'pois'), schema: PoiSchema, bucket: 'pois' },
  ] as const;

  for (const g of groups) {
    for (const file of listJson(g.dir)) {
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        out.failures.push({ file: rel(file), message: `JSON 语法错误：${(e as Error).message}` });
        continue;
      }
      const parsed = g.schema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path.join('.') || '(根)';
          out.failures.push({ file: rel(file), message: `${path}：${issue.message}` });
        }
        continue;
      }
      // 三个 bucket 的元素类型各不相同，此处按 group 分派，运行时安全
      if (g.bucket === 'countries') {
        out.countries.push({ file: rel(file), data: parsed.data as Country });
      } else if (g.bucket === 'cities') {
        out.cities.push({ file: rel(file), data: parsed.data as City });
      } else {
        out.pois.push({ file: rel(file), data: parsed.data as Poi });
      }
    }
  }

  return out;
}

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
