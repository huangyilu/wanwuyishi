/**
 * 把 content/ 的编著源文件编译成运行时数据到 public/data/。
 *
 * 产物：
 *   index.json          国家 + 城市摘要 + POI 摘要（一次请求拿到导航所需的全部数据）
 *   country/<id>.json   国家全文（含签证卡）
 *   city/<id>.json      城市全文（含 survival）
 *   poi/<id>.json       POI 全文（含深导览）
 *   search.json         轻量搜索记录
 *   aliases.json        旧 id → 新 id，保证老行程不断链
 *
 * 编著期字段（_todo / _sources）在这里剥离，不进运行时。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent, OUT_DIR } from './content-io.js';
import type { Poi } from '../src/domain/world/schema.js';

function write(relPath: string, data: unknown): number {
  const file = join(OUT_DIR, relPath);
  mkdirSync(join(file, '..'), { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(file, json, 'utf8');
  return Buffer.byteLength(json);
}

function toSummary(p: Poi) {
  return {
    id: p.id,
    type: p.type,
    name: p.name,
    localName: p.localName,
    city: p.city,
    country: p.country,
    location: p.location,
    tags: p.tags,
    popularity: p.popularity,
    closedWeekdays: p.openness.closedWeekdays,
    hasGuide: Boolean(p.guide),
    durationMinutes: p.visit.durationMinutes,
    bookingLeadDays: p.booking?.required ? p.booking.leadDays : null,
  };
}

function main(): void {
  const { countries, cities, pois, failures } = loadContent();
  if (failures.length > 0) {
    console.error('内容存在结构错误，先跑 npm run content:validate 修好再构建：');
    for (const f of failures.slice(0, 10)) console.error(`  ${f.file}  ${f.message}`);
    process.exit(1);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  let bytes = 0;

  for (const { data } of countries) bytes += write(`country/${data.id}.json`, data);
  for (const { data } of cities) bytes += write(`city/${data.id}.json`, data);
  for (const { data } of pois) {
    const { _todo, _sources, ...runtime } = data;
    void _todo;
    void _sources;
    bytes += write(`poi/${data.id}.json`, runtime);
  }

  const poiSummaries = pois.map((p) => toSummary(p.data));
  const cityIndex = cities.map(({ data }) => ({
    id: data.id,
    name: data.name,
    localName: data.localName,
    country: data.country,
    location: data.location,
    poiCount: poiSummaries.filter((p) => p.city === data.id).length,
    hasSurvival: data.survival.length > 0,
  }));

  bytes += write('index.json', {
    generatedAt: new Date().toISOString(),
    countries: countries.map(({ data }) => ({
      id: data.id,
      name: data.name,
      localName: data.localName,
      currency: data.currency,
      hasVisa: Boolean(data.visa),
    })),
    cities: cityIndex,
    pois: poiSummaries.sort((a, b) => b.popularity - a.popularity),
  });

  bytes += write(
    'search.json',
    [
      ...cities.map(({ data }) => ({
        id: data.id,
        kind: 'city' as const,
        text: `${data.name} ${data.localName}`,
      })),
      ...pois.map(({ data }) => ({
        id: data.id,
        kind: 'poi' as const,
        text: `${data.name} ${data.localName} ${data.tags.join(' ')}`,
        city: data.city,
      })),
    ],
  );

  const aliases: Record<string, string> = {};
  for (const { data } of pois) for (const a of data.aliases) aliases[a] = data.id;
  bytes += write('aliases.json', aliases);

  console.log(
    `✓ 世界库已编译 → public/data  ` +
      `${countries.length} 国 / ${cities.length} 城 / ${pois.length} POI，` +
      `共 ${(bytes / 1024).toFixed(1)} KB`,
  );
}

main();
