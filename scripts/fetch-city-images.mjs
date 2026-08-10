/**
 * 从 Wikimedia Commons 抓取每个城市的自由版权风景图，本地打包到 public/img/cities/。
 *
 * 许可策略：仅采用允许再分发的自由版权（CC0 / CC-BY / CC-BY-SA / 公有领域），
 * 拒绝 NC（非商业）/ ND（禁止演绎）。每张图都记录作者 + 许可 + 来源页，供 UI 署名。
 *
 * 纯装饰性资源：图片按 city id 约定路径存放（/img/cities/{id}.jpg），
 * 不写入内容 schema（city 图片不是"可变信息"，无需 source+verifiedAt）。
 *
 * 注：Node 的 fetch(undici) 在本沙箱连 Wikimedia 超时，统一改用 curl 走网络。
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'img', 'cities');
const CREDITS_PATH = join(OUT_DIR, 'credits.json');
const UA = 'WanWuYiShi/1.0 (https://github.com/huangyilu/wanwuyishi; travel planner)';

const CITIES = [
  { id: 'city-paris', queries: ['Paris skyline', 'Paris panorama', 'Tour Eiffel Paris'] },
  { id: 'city-rome', queries: ['Rome skyline', 'Rome panorama', 'Roma skyline'] },
  { id: 'city-florence', queries: ['Florence skyline', 'Florence panorama', 'Firenze duomo'] },
  { id: 'city-lucerne', queries: ['Lucerne Switzerland', 'Lucerne skyline', 'Kapellbrücke Lucerne'] },
];

const ALLOWED = /^(CC0|CC BY|CC-BY|CC BY-SA|CC-BY-SA|PUBLIC DOMAIN|PUBLICDOMAIN)/i;
const REJECT = /(NC|ND|NON-COMMERCIAL|NO DERIVATIVES)/i;

async function curlJson(params) {
  const url =
    'https://commons.wikimedia.org/w/api.php?format=json&' +
    Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
  const { stdout } = await exec('curl', ['-s', '-m', '30', '-A', UA, url]);
  return JSON.parse(stdout);
}

async function curlDownload(url, dest) {
  await exec('curl', ['-s', '-m', '90', '-A', UA, '-o', dest, url]);
}

function stripTags(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(title) {
  const t = title.toLowerCase();
  let s = 0;
  if (/(skyline|panorama|panoramic|cityscape|aerial|view|landscape)/.test(t)) s += 3;
  if (/(paris|rome|roma|florence|firenze|lucerne|luzern)/.test(t)) s += 1;
  if (/(map|flag|logo|coat of arms|svg|diagram|icon)/.test(t)) s -= 100;
  return s;
}

async function pickImage(queries) {
  const seen = new Set();
  for (const q of queries) {
    const data = await curlJson({
      action: 'query',
      generator: 'search',
      gsrsearch: q,
      gsrnamespace: 6,
      gsrlimit: 20,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime|size',
      iiurlwidth: 900,
    });
    const pages = data.query?.pages ?? {};
    const cands = [];
    for (const p of Object.values(pages)) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const mime = ii.mime || '';
      if (!mime.startsWith('image/') || mime === 'image/svg+xml') continue;
      const em = ii.extmetadata || {};
      const license = em.LicenseShortName?.value || '';
      if (!ALLOWED.test(license) || REJECT.test(license)) continue;
      const key = p.title;
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push({
        title: p.title,
        thumburl: ii.thumburl || ii.url,
        url: ii.url,
        author: stripTags(em.Artist?.value) || em.Credit?.value || 'Wikimedia Commons',
        license,
        page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
        width: ii.width || 0,
        score: score(p.title),
      });
    }
    cands.sort((a, b) => b.score - a.score || b.width - a.width);
    const best = cands[0];
    if (best) return best;
  }
  return null;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let credits = [];
  try {
    credits = JSON.parse(await readFile(CREDITS_PATH, 'utf8'));
  } catch {
    credits = [];
  }

  for (const c of CITIES) {
    const dest = join(OUT_DIR, `${c.id}.jpg`);
    const existing = credits.find((x) => x.id === c.id);
    if (existing && existsSync(dest)) {
      console.log(`skip ${c.id} (already have)`);
      continue;
    }
    console.log(`\n=== ${c.id} ===`);
    const img = await pickImage(c.queries);
    if (!img) {
      console.log('  ! no free-licensed image found');
      continue;
    }
    console.log(`  picked: ${img.title}`);
    console.log(`  license: ${img.license} | author: ${img.author}`);
    try {
      await curlDownload(img.thumburl, dest);
      const { stdout } = await exec('wc', ['-c', dest]);
      console.log(`  saved ${stdout.trim()} bytes -> ${dest}`);
      credits = credits.filter((x) => x.id !== c.id);
      credits.push({
        id: c.id,
        title: img.title,
        author: img.author,
        license: img.license,
        page: img.page,
        source: img.url,
      });
    } catch (e) {
      console.log(`  ! download failed: ${e.message}`);
    }
  }

  await writeFile(CREDITS_PATH, JSON.stringify(credits, null, 2) + '\n', 'utf8');
  console.log('\nwrote credits.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
