/**
 * 修正自动挑选中出错/重复的配图：用更精确的搜索词 + 相关性过滤重新下载并覆盖。
 * 运行：node scripts/fix-images.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const exec = promisify(execFile);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POI_OUT = 'public/img/pois';
const CITY_OUT = 'public/img/cities';

// 需修正的条目：id, bucket, 搜索词, 必须含(正则), 排除(正则)
const FIXES = [
  { id: 'poi-accademia', bucket: 'poi', q: ['Michelangelo David statue Florence', 'David di Michelangelo Firenze'], req: /David|Michelangelo/, ex: /Venezia|Venice|bridge|Pontile/ },
  { id: 'poi-jungfraujoch', bucket: 'poi', q: ['Jungfraujoch snow mountain', 'Jungfrau Alps peak Switzerland'], req: /Jungfrau/, ex: /Building|station|inside|Nebula|Galaxy|Telescope/ },
];

async function curlJson(url, attempt = 0) {
  try {
    const { stdout } = await exec('curl', ['-s', '-m', '40', '-4', '-A', UA, url], { maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (e) { if (attempt < 5) { await sleep(3500); return curlJson(url, attempt + 1); } throw e; }
}

async function curlDownload(url, dest) {
  await exec('curl', ['-4', '-s', '-L', '-A', UA, '-m', '120', '-o', dest, url]);
  const sz = (await stat(dest)).size;
  if (sz < 2048) throw new Error(`too small (${sz})`);
  return sz;
}

function isFree(lic) {
  if (!lic) return false;
  const L = lic.toLowerCase();
  if (/nc|nd/.test(L)) return false;
  return /cc0|cc[- ]?by|cc[- ]?by[- ]?sa|public domain|公有领域/.test(L);
}

async function search(q) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=16&srsearch=${encodeURIComponent(q)}`;
  const j = await curlJson(url);
  return (j.query?.search || []).map((r) => r.title);
}

async function infos(titles) {
  if (titles.length === 0) return [];
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=1280&titles=${encodeURIComponent(titles.join('|'))}`;
  const j = await curlJson(url);
  const pages = j.query?.pages || {};
  const out = [];
  for (const k in pages) {
    const p = pages[k];
    const ii = p.imageinfo?.[0] || {};
    const em = ii.extmetadata || {};
    out.push({
      title: p.title, url: ii.url, thumb: ii.thumburl, w: ii.width, h: ii.height,
      mime: ii.mime, lic: em.LicenseShortName?.value,
      author: (em.Artist?.value || '').replace(/<[^>]+>/g, '').replace(/\[\[[^\]]+\|([^\]]+)\]\]/g, '$1').replace(/\(\[\[[^\]]+\]\]\)$/, '').trim(),
    });
  }
  return out;
}

async function pick(entry, minW) {
  const titles = new Set();
  for (const q of entry.q) { (await search(q)).forEach((t) => titles.add(t)); await sleep(500); }
  const list = (await infos([...titles])).filter(
    (i) => i.mime?.startsWith('image/') && !/svg|gif/i.test(i.mime) && (i.w || 0) >= minW && isFree(i.lic)
      && (!entry.req || entry.req.test(i.title)) && (!entry.ex || !entry.ex.test(i.title))
  );
  if (list.length === 0) return null;
  list.sort((a, b) => (b.w || 0) - (a.w || 0));
  return list[0];
}

async function mergeCredits(dir, next) {
  const file = `${dir}/credits.json`;
  let cur = {};
  if (existsSync(file)) { try { cur = JSON.parse(await readFile(file, 'utf8')); } catch { cur = {}; } }
  await writeFile(file, JSON.stringify({ ...cur, ...next }, null, 2));
}

async function run() {
  const credits = {};
  for (const entry of FIXES) {
    const isCity = entry.bucket === 'city';
    const OUT = isCity ? CITY_OUT : POI_OUT;
    await mkdir(OUT, { recursive: true });
    process.stdout.write(`\n=== ${entry.id} ===\n`);
    const best = await pick(entry, isCity ? 600 : 800);
    if (!best) { console.log('  (no candidate)'); await sleep(500); continue; }
    const dest = `${OUT}/${entry.id}.jpg`;
    const page = `https://commons.wikimedia.org/wiki/${encodeURIComponent(best.title)}`;
    let ok = false;
    for (let a = 0; a < 4 && !ok; a++) {
      try {
        const sz = await curlDownload(best.thumb || best.url, dest);
        credits[entry.id] = { src: `/img/${isCity ? 'cities' : 'pois'}/${entry.id}.jpg`, author: best.author || '?', license: best.lic || '?', page };
        console.log(`  saved ${entry.id} <- ${best.title} (${(sz / 1024).toFixed(0)} KB, ${best.lic})`);
        ok = true;
      } catch (e) { console.log(`  retry ${a + 1}: ${e.message}`); await sleep(3000); }
    }
    if (!ok) console.log(`  !! FAILED ${entry.id}`);
    await sleep(1500);
  }
  for (const [bucket, dir] of [['poi', POI_OUT], ['city', CITY_OUT]]) {
    const subset = Object.fromEntries(Object.entries(credits).filter(([k]) => k.startsWith(bucket === 'poi' ? 'poi-' : 'city-')));
    if (Object.keys(subset).length) await mergeCredits(dir, subset);
  }
  console.log('\nFIX DONE');
}
run().catch((e) => { console.error(e); process.exit(1); });
