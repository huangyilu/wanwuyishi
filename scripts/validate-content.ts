/**
 * 世界库内容校验 —— CI 门禁。
 *
 * 分两层：
 *   1. 结构校验：zod schema（字段类型、必填、格式）
 *   2. 业务规则：checkPoiRules（引用完整性、坐标越界、时长区间、深导览缺失、时效）
 *
 * error 级问题会让进程以非 0 退出，warn 只提示。
 */
import { checkPoiRules, type ContentIssue } from '../src/domain/world/schema.js';
import { loadContent, today } from './content-io.js';

const C = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function main(): void {
  const { countries, cities, pois, failures } = loadContent();
  const issues: ContentIssue[] = failures.map((f) => ({
    file: f.file,
    level: 'error',
    message: f.message,
  }));

  const countryIds = new Set(countries.map((c) => c.data.id));
  const cityIds = new Set(cities.map((c) => c.data.id));
  const day = today();

  // 城市引用的国家必须存在
  for (const { file, data } of cities) {
    if (!countryIds.has(data.country)) {
      issues.push({ file, level: 'error', message: `引用了不存在的国家 ${data.country}` });
    }
  }

  // POI 逐条跑业务规则
  const seenIds = new Map<string, string>();
  for (const { file, data } of pois) {
    const prev = seenIds.get(data.id);
    if (prev) {
      issues.push({ file, level: 'error', message: `id ${data.id} 与 ${prev} 重复` });
    }
    seenIds.set(data.id, file);
    issues.push(...checkPoiRules(data, { file, cityIds, countryIds, today: day }));
  }

  // 没有任何 POI 的城市：不是错误，但通常意味着内容没跟上
  const poiCities = new Set(pois.map((p) => p.data.city));
  for (const { file, data } of cities) {
    if (!poiCities.has(data.id)) {
      issues.push({ file, level: 'warn', message: '该城市下还没有任何 POI' });
    }
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  for (const i of errors) console.error(`${C.red('✗ error')} ${C.dim(i.file)} ${i.message}`);
  for (const i of warns) console.warn(`${C.yellow('! warn ')} ${C.dim(i.file)} ${i.message}`);

  const summary = `${countries.length} 国 / ${cities.length} 城 / ${pois.length} POI（其中 ${
    pois.filter((p) => p.data.guide).length
  } 篇深导览）`;

  if (errors.length > 0) {
    console.error(`\n${C.red(`校验未通过：${errors.length} 个错误，${warns.length} 个警告`)}  ${summary}`);
    process.exit(1);
  }
  console.log(`\n${C.green('✓ 内容校验通过')}  ${summary}${warns.length ? `，${warns.length} 个警告` : ''}`);
}

main();
