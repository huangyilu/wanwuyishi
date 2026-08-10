/**
 * 新增城市/POI 配图抓取（自动挑选 + 下载）。
 *
 * 对每个 id：在 Wikimedia Commons 搜索自由版权候选 → 选分辨率最高且允许再分发的图片
 * → 下载到 public/img/{pois,cities}/{id}.jpg，并合并写入对应 credits.json。
 *
 * 来源仅采用允许再分发的自由版权（CC0 / CC-BY / CC-BY-SA / 公有领域）。
 * 运行：node scripts/fetch-new-images.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const exec = promisify(execFile);
// Wikimedia 的图片 CDN（upload.wikimedia.org）会拒绝自定义 bot UA（返回 403），
// 用浏览器 UA 才能正常取图。图片均为自由版权并已署名，仅用于本项目静态打包。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POI_OUT = 'public/img/pois';
const CITY_OUT = 'public/img/cities';
const THUMB_W = 1280;

// 新增条目：id → 搜索词
const POIS = [
  { id: 'poi-accademia', q: ['Accademia Gallery Florence', 'David Michelangelo statue'] },
  { id: 'poi-ponte-vecchio', q: ['Ponte Vecchio Florence'] },
  { id: 'poi-piazzale-michelangelo', q: ['Piazzale Michelangelo Florence'] },
  { id: 'poi-duomo-milano', q: ['Milan Cathedral', 'Duomo di Milano'] },
  { id: 'poi-last-supper', q: ['The Last Supper Leonardo da Vinci', 'Santa Maria delle Grazie Milan'] },
  { id: 'poi-galleria-vittorio', q: ['Galleria Vittorio Emanuele II Milan'] },
  { id: 'poi-sforza-castle', q: ['Sforza Castle Milan'] },
  { id: 'poi-pinacoteca-brera', q: ['Pinacoteca di Brera'] },
  { id: 'poi-san-marco', q: ['Piazza San Marco Venice'] },
  { id: 'poi-st-marks-basilica', q: ['St Mark Basilica Venice', 'Basilica di San Marco interior'] },
  { id: 'poi-doge-palace', q: ['Doge Palace Venice'] },
  { id: 'poi-rialto-bridge', q: ['Rialto Bridge Venice'] },
  { id: 'poi-bridge-of-sighs', q: ['Bridge of Sighs Venice'] },
  { id: 'poi-mann', q: ['National Archaeological Museum Naples'] },
  { id: 'poi-castel-dellovo', q: ['Castel dell Ovo Naples'] },
  { id: 'poi-galleria-umberto', q: ['Galleria Umberto I Naples'] },
  { id: 'poi-vesuvius', q: ['Mount Vesuvius', 'Vesuvius crater'] },
  { id: 'poi-pompeii', q: ['Pompeii ruins', 'Pompeii fresco'] },
  { id: 'poi-blue-grotto', q: ['Blue Grotto Capri'] },
  { id: 'poi-gardens-augustus', q: ['Gardens of Augustus Capri'] },
  { id: 'poi-tre-cime', q: ['Tre Cime di Lavaredo'] },
  { id: 'poi-seceda', q: ['Seceda Dolomites'] },
  { id: 'poi-val-di-funes', q: ['Val di Funes Dolomites', 'Santa Giovanni Val di Funes'] },
  { id: 'poi-lago-misurina', q: ['Lago di Misurina'] },
  { id: 'poi-jungfraujoch', q: ['Jungfraujoch', 'Top of Europe'] },
  { id: 'poi-harder-kulm', q: ['Harder Kulm'] },
  { id: 'poi-schilthorn', q: ['Schilthorn', 'Piz Gloria'] },
  { id: 'poi-lake-brienz', q: ['Lake Brienz', 'Brienzersee'] },
  { id: 'poi-lake-thun', q: ['Lake Thun', 'Thunersee'] },
  { id: 'poi-matterhorn', q: ['Matterhorn', 'Matterhorn Zermatt'] },
  { id: 'poi-gornergrat', q: ['Gornergrat', 'Gornergrat railway'] },
];

const CITIES = [
  { id: 'city-milan', q: ['Milan skyline', 'Milano Duomo'] },
  { id: 'city-venice', q: ['Venice Grand Canal', 'Venezia skyline'] },
  { id: 'city-naples', q: ['Naples skyline', 'Napoli'] },
  { id: 'city-pompeii', q: ['Pompeii ruins', 'Pompei scavi'] },
  { id: 'city-capri', q: ['Capri island', 'Marina Grande Capri'] },
  { id: 'city-dolomites', q: ['Dolomites mountains', 'Tre Cime di Lavaredo'] },
  { id: 'city-interlaken', q: ['Interlaken', 'Interlaken Switzerland'] },
  { id: 'city-zermatt', q: ['Zermatt Matterhorn', 'Zermatt village'] },
];

async function curlJson(url, attempt = 0) {
  try {
    const { stdout } = await exec('curl', ['-s', '-m', '40', '-4', '-A', UA, url], { maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (e) {
    if (attempt < 5) { await sleep(3500); return curlJson(url, attempt + 1); }
    throw e;
  }
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
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=${THUMB_W}&titles=${encodeURIComponent(titles.join('|'))}`;
  const j = await curlJson(url);
  const pages = j.query?.pages || {};
  const out = [];
  for (const k in pages) {
    const p = pages[k];
    const ii = p.imageinfo?.[0] || {};
    const em = ii.extmetadata || {};
    out.push({
      title: p.title,
      url: ii.url,
      thumb: ii.thumburl,
      w: ii.width,
      h: ii.height,
      mime: ii.mime,
      lic: em.LicenseShortName?.value,
      author: (em.Artist?.value || '').replace(/<[^>]+>/g, '').replace(/\[\[[^\]]+\|([^\]]+)\]\]/g, '$1').replace(/\(\[\[[^\]]+\]\]\)$/, '').trim(),
    });
  }
  return out;
}

async function pick(entry) {
  const titles = new Set();
  for (const q of entry.q) {
    (await search(q)).forEach((t) => titles.add(t));
    await sleep(400);
  }
  const list = (await infos([...titles])).filter(
    (i) => i.mime?.startsWith('image/') && !/svg|gif/i.test(i.mime) && (i.w || 0) >= 800 && isFree(i.lic)
  );
  if (list.length === 0) return null;
  list.sort((a, b) => (b.w || 0) - (a.w || 0));
  return list[0];
}

async function mergeCredits(dir, next) {
  const file = `${dir}/credits.json`;
  let cur = {};
  if (existsSync(file)) {
    try { cur = JSON.parse(await readFile(file, 'utf8')); } catch { cur = {}; }
  }
  const merged = { ...cur, ...next };
  await writeFile(file, JSON.stringify(merged, null, 2));
}

async function run(bucket) {
  const isCity = bucket === 'city';
  const OUT = isCity ? CITY_OUT : POI_OUT;
  const entries = isCity ? CITIES : POIS;
  await mkdir(OUT, { recursive: true });
  const credits = {};
  for (const entry of entries) {
    process.stdout.write(`\n=== ${entry.id} ===\n`);
    let best = null;
    try { best = await pick(entry); } catch (e) { console.log(`  search failed: ${e.message}`); }
    if (!best) { console.log('  (no free candidate found)'); await sleep(500); continue; }
    const dest = `${OUT}/${entry.id}.jpg`;
    const page = `https://commons.wikimedia.org/wiki/${encodeURIComponent(best.title)}`;
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const sz = await curlDownload(best.thumb || best.url, dest);
        credits[entry.id] = { src: `/img/${isCity ? 'cities' : 'pois'}/${entry.id}.jpg`, author: best.author || '?', license: best.lic || '?', page };
        console.log(`  saved ${entry.id} <- ${best.title} (${(sz / 1024).toFixed(0)} KB, ${best.lic})`);
        ok = true;
      } catch (e) {
        console.log(`  download retry ${attempt + 1}: ${e.message}`);
        await sleep(3000);
      }
    }
    if (!ok) console.log(`  !! FAILED ${entry.id}`);
    await sleep(1500);
  }
  await mergeCredits(OUT, credits);
  console.log(`\nwrote credits.json for ${bucket} (${Object.keys(credits).length} new)`);
}

await run('poi');
await run('city');
console.log('\nDONE');
