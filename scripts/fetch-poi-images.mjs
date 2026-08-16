/**
 * 景点（POI）图片抓取：
 *   MODE=search   （默认）列出每个 POI 的自由版权候选，供人工挑选
 *   MODE=download 按 PICKS 表下载到 public/img/pois/{id}.jpg 并写 credits.json
 *
 * 来源 Wikimedia Commons，仅采用允许再分发的自由版权（CC0 / CC-BY / CC-BY-SA / 公有领域）。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const OUT = 'public/img/pois';

const POIS = [
  { id: 'poi-louvre', q: ['Louvre Museum Paris exterior', 'Musée du Louvre facade'] },
  { id: 'poi-colosseum', q: ['Colosseum Rome exterior', 'Colosseo Roma'] },
  { id: 'poi-eiffel-tower', q: ['Eiffel Tower Paris', 'Tour Eiffel'] },
  { id: 'poi-vatican-museums', q: ['Vatican Museums courtyard', 'Apostolic Palace Vatican'] },
  { id: 'poi-uffizi', q: ['Uffizi Gallery Florence', 'Galleria degli Uffizi'] },
  { id: 'poi-duomo-florence', q: ['Florence Cathedral', 'Cattedrale di Santa Maria del Fiore'] },
  { id: 'poi-orsay', q: ['Musée d Orsay Paris', 'Gare d Orsay'] },
  { id: 'poi-pantheon-rome', q: ['Pantheon Rome', 'Pantheon Roma interior'] },
  { id: 'poi-mount-pilatus', q: ['Mount Pilatus Switzerland', 'Pilatus mountain'] },
  { id: 'poi-chapel-bridge', q: ['Kapellbrücke Lucerne', 'Chapel Bridge Luzern'] },
  { id: 'poi-sainte-chapelle', q: ['Sainte-Chapelle Paris', 'Sainte Chapelle interior'] },

  // ---- 罗马补充（2026-08-15 新增 POI，待配图） ----
  { id: 'poi-foro-romano-palatino', q: ['Roman Forum Rome', 'Foro Romano Roma', 'Palatine Hill Rome'] },
  { id: 'poi-piazza-venezia-vittoriano', q: ['Piazza Venezia Rome', 'Altare della Patria Rome', 'Victor Emmanuel II Monument'] },
  { id: 'poi-trevi-fountain', q: ['Trevi Fountain Rome', 'Fontana di Trevi'] },
  { id: 'poi-mouth-of-truth', q: ['Mouth of Truth Rome', 'Bocca della Verita'] },
  { id: 'poi-trastevere', q: ['Trastevere Rome', 'Santa Maria in Trastevere'] },
  { id: 'poi-sistine-chapel', q: ['Sistine Chapel interior ceiling', 'Cappella Sistina Vatican'] },
  { id: 'poi-st-peters-basilica', q: ['St Peter Basilica facade Vatican', 'Basilica di San Pietro dome'] },

  // ---- 多洛米蒂补充（2026-08-15 新增 POI，待配图） ----
  { id: 'poi-ortisei', q: ['Ortisei St Ulrich Groden', 'Ortisei town Val Gardena'] },
  { id: 'poi-alpe-di-siusi', q: ['Alpe di Siusi Seiser Alm meadow', 'Seiser Alm Dolomites'] },
  { id: 'poi-lago-di-braies', q: ['Lago di Braies Pragser Wildsee', 'Pragser Wildsee Dolomites'] },
  { id: 'poi-grindelwald', q: ['Grindelwald village Eiger', 'Grindelwald First Bachalpsee'] },
  { id: 'poi-spiez', q: ['Spiez castle Thun lake', 'Spiez village Bern'] },
  { id: 'poi-first', q: ['Grindelwald First Cliff Walk', 'Bachalpsee First Grindelwald'] },
  { id: 'poi-versailles', q: ['Palace of Versailles exterior', 'Chateau de Versailles garden'] },
  { id: 'poi-arc-de-triomphe', q: ['Arc de Triomphe Paris', 'Arc de Triomphe rooftop'] },
  { id: 'poi-notre-dame-paris', q: ['Notre Dame de Paris cathedral', 'Notre Dame Paris facade'] },
  { id: 'poi-sacre-coeur', q: ['Sacre Coeur basilica Montmartre', 'Sacre Coeur Paris view'] },
  { id: 'poi-seine', q: ['Seine river Paris at night', 'Bateaux Mouches Seine'] },
  { id: 'poi-champs-elysees', q: ['Champs Elysees avenue Paris', 'Champs Elysees Arc de Triomphe'] },
  { id: 'poi-les-invalides', q: ['Les Invalides Paris dome', 'Hotel des Invalides Napoleon tomb'] },
  { id: 'poi-place-de-la-concorde', q: ['Place de la Concorde Paris obelisk', 'Concorde fountain Paris'] },
  { id: 'poi-arts-forains', q: ['Musee des Arts Forains Paris carousel', 'Arts Forains Bercy Paris'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 浏览器 UA + 项目署名：Wikimedia 图片 CDN(upload.wikimedia.org) 会拒自定义 bot UA(403)，
// 但放行标准浏览器 UA；附项目信息以尽量符合其 robot policy。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (wanwuyishi-travel/1.0; +https://github.com/huangyilu/wanwuyishi)';

async function curlJson(url, attempt = 0) {
  try {
    const { stdout } = await exec('curl', ['-s', '-m', '35', '-4', '-A', UA, url], { maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (e) {
    // 直连失败（如国内被墙）→ 试公共 CORS 代理兜底
    if (attempt < 2) {
      try {
        const prox = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const { stdout } = await exec('curl', ['-s', '-m', '35', '-A', UA, prox], { maxBuffer: 32 * 1024 * 1024 });
        return JSON.parse(stdout);
      } catch {
        /* 忽略，进入重试 */
      }
    }
    if (attempt < 4) {
      await sleep(2500);
      return curlJson(url, attempt + 1);
    }
    throw e;
  }
}

async function curlBinary(url, attempt = 0) {
  try {
    const { stdout } = await exec('curl', ['-s', '-m', '60', '-L', '-A', UA, url], { maxBuffer: 64 * 1024 * 1024 });
    return Buffer.from(stdout, 'binary');
  } catch (e) {
    if (attempt < 5) {
      await sleep(3000);
      return curlBinary(url, attempt + 1);
    }
    throw e;
  }
}

/** Wikimedia 文件名 -> 原始图 + 960px 缩略图直链（MD5 目录规则，免 API；含非 ASCII 编码） */
function wikiUrls(file, w = 960) {
  const name = file.replace(/^File:/, '').replace(/ /g, '_');
  const enc = encodeURIComponent(name);
  const md5 = createHash('md5').update(name, 'utf8').digest('hex');
  const dir = `${md5[0]}/${md5.slice(0, 2)}`;
  const orig = `https://upload.wikimedia.org/wikipedia/commons/${dir}/${enc}`;
  const thumb = `https://upload.wikimedia.org/wikipedia/commons/${dir}/thumb/${enc}/${w}px-${enc}`;
  return { orig, thumb };
}
/** 走 images.weserv.nl 服务端代理抓取（绕过直连 Wikimedia 被墙/超时） */
function weserv(url, w = 960) {
  return `https://images.weserv.nl/?url=ssl:${url.replace(/^https?:\/\//, '')}&w=${w}&output=jpg&q=82`;
}

/** 单 URL 下载到文件（短超时），成功返回大小，失败抛错。weserv 优先（服务端缩放），直连原图兜底 */
async function curlOne(url, dest, timeout) {
  const isDirect = !url.includes('weserv');
  await exec('curl', ['-s', '-L', '-A', UA, '-m', String(timeout ?? (isDirect ? 90 : 40)), '-o', dest, url]);
  const sz = (await stat(dest)).size;
  if (sz < 1024) throw new Error('too small');
  return sz;
}

/** 下载后用 sips 约束最大边 960px（macOS 自带；非 mac 环境跳过） */
let _hasSips = null;
async function resizeTo960(dest) {
  if (_hasSips === null) {
    try { await exec('which', ['sips']); _hasSips = true; } catch { _hasSips = false; }
  }
  if (!_hasSips) return;
  const tmp = `${dest}.tmp.jpg`;
  try {
    await exec('sips', ['-Z', '960', dest, '--out', tmp]);
    await rename(tmp, dest);
  } catch {
    /* 缩放失败不影响原图 */
  }
}

function isFree(lic) {
  if (!lic) return false;
  const L = lic.toLowerCase();
  if (/nc|nd/.test(L)) return false;
  return /cc0|cc[- ]?by|cc[- ]?by[- ]?sa|public domain|公有领域/.test(L);
}

async function search(q) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=14&srsearch=${encodeURIComponent(q)}`;
  const j = await curlJson(url);
  return (j.query?.search || []).map((r) => r.title);
}

async function infos(titles) {
  if (titles.length === 0) return [];
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=960&titles=${encodeURIComponent(titles.join('|'))}`;
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
      author: em.Artist?.value?.replace(/<[^>]+>/g, '').replace(/\[\[[^\]]+\|([^\]]+)\]\]/g, '$1').trim(),
    });
  }
  return out;
}

async function main() {
  if (process.env.MODE === 'download') {
    await mkdir(OUT, { recursive: true });
    const credits = {};
    // 多轮补抓：每轮只抓「还没下到」的，单文件失败不阻塞其它，靠轮次重试对抗间歇性网络
    for (let pass = 0; pass < 6; pass++) {
      let pending = 0;
      for (const { id, file, author, license, page } of PICKS) {
        const dest = `${OUT}/${id}.jpg`;
        try {
          if ((await stat(dest)).size >= 1024) {
            if (!credits[id]) credits[id] = { src: `/img/pois/${id}.jpg`, author, license, page };
            continue;
          }
        } catch { /* 尚未下载 */ }
        const { orig, thumb } = wikiUrls(file);
        const candidates = [weserv(thumb), weserv(orig), orig];
        let ok = false;
        for (const u of candidates) {
          try {
            const sz = await curlOne(u, dest, u.includes('weserv') ? 40 : 90);
            credits[id] = { src: `/img/pois/${id}.jpg`, author, license, page };
            await resizeTo960(dest);
            const finalSz = (await stat(dest)).size;
            console.log(`saved ${id} <- ${file} (${(finalSz / 1024).toFixed(0)} KB)`);
            ok = true;
            break;
          } catch { /* 试下一个候选 */ }
        }
        if (!ok) { pending++; console.log(`retry ${id}`); }
        await sleep(700);
      }
      if (pending === 0) { console.log(`all ${PICKS.length} done in pass ${pass + 1}`); break; }
      console.log(`-- pass ${pass + 1} done, ${pending} pending, retrying --`);
      await sleep(4000);
    }
    const missing = PICKS.filter((p) => !credits[p.id]).map((p) => p.id);
    if (missing.length) console.log('STILL MISSING: ' + missing.join(', '));
    await writeFile(`${OUT}/credits.json`, JSON.stringify(credits, null, 2));
    console.log('wrote credits.json');
    return;
  }

  // search mode
  for (const poi of POIS) {
    console.log(`\n=== ${poi.id} ===`);
    const titles = new Set();
    for (const q of poi.q) (await search(q)).forEach((t) => titles.add(t));
    await sleep(600);
    const infosList = (await infos([...titles])).filter(
      (i) => i.mime?.startsWith('image/') && !/svg|gif/i.test(i.mime) && (i.w || 0) >= 600 && isFree(i.lic)
    );
    infosList.sort((a, b) => (b.w || 0) - (a.w || 0));
    infosList.slice(0, 6).forEach((i) =>
      console.log(`  ${i.title}  |  ${i.lic}  |  ${i.w}x${i.h}  |  ${i.author || '?'}`)
    );
    if (infosList.length === 0) console.log('  (no free candidate found)');
    await sleep(900);
  }
}

/** 人工挑选后填写：{id, file: 'File:...', author, license, page} */
const PICKS = [
  { id: 'poi-louvre', file: 'File:Cour Carrée du Louvre in 2019.jpg', author: 'Arunkumar Vijayan', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Cour_Carrée_du_Louvre_in_2019.jpg' },
  { id: 'poi-colosseum', file: 'File:Colosseum of Rome and Roman forum.jpg', author: 'Wilfredor', license: 'CC0', page: 'https://commons.wikimedia.org/wiki/File:Colosseum_of_Rome_and_Roman_forum.jpg' },
  { id: 'poi-eiffel-tower', file: 'File:Eiffel Tower in 2022 02.jpg', author: 'Maksim Sokolov', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Eiffel_Tower_in_2022_02.jpg' },
  { id: 'poi-vatican-museums', file: 'File:Courtyard, Vatican Museum (45510285915).jpg', author: 'Deb Nystrom', license: 'CC BY 2.0', page: 'https://commons.wikimedia.org/wiki/File:Courtyard,_Vatican_Museum_(45510285915).jpg' },
  { id: 'poi-uffizi', file: 'File:Galería Uffizi, Florencia, Italia, 2022-09-18, DD 29.jpg', author: 'Diego Delso', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Galería_Uffizi,_Florencia,_Italia,_2022-09-18,_DD_29.jpg' },
  { id: 'poi-duomo-florence', file: 'File:Florence Cathedral seen from Piazzale Michelangelo night dllu.jpg', author: 'Dllu', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Florence_Cathedral_seen_from_Piazzale_Michelangelo_night_dllu.jpg' },
  { id: 'poi-orsay', file: "File:Musee d'Orsay and Pont Royal, North-West view 140402 1.jpg", author: 'DXR', license: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:Musee_d'Orsay_and_Pont_Royal,_North-West_view_140402_1.jpg" },
  { id: 'poi-pantheon-rome', file: 'File:Pantheon (Rome) - Right side and front.jpg', author: 'NikonZ7II', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Pantheon_(Rome)_-_Right_side_and_front.jpg' },
  { id: 'poi-mount-pilatus', file: 'File:Luzern - Mount Pilatus - March 2019 (01).jpg', author: 'Liridon', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Luzern_-_Mount_Pilatus_-_March_2019_(01).jpg' },
  { id: 'poi-chapel-bridge', file: 'File:Lucerne Kapellbrücke and Wasserturm from the west.jpg', author: 'Ymblanter', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Lucerne_Kapellbrücke_and_Wasserturm_from_the_west.jpg' },
  { id: 'poi-sainte-chapelle', file: 'File:Sainte Chapelle Interior Stained Glass.jpg', author: 'Oldmanisold', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Sainte_Chapelle_Interior_Stained_Glass.jpg' },

  // ---- 罗马补充（2026-08-15/16 新增 POI，已配图） ----
  { id: 'poi-sistine-chapel', file: 'File:Vatican Sistine Chapel Ceiling (9808850053).jpg', author: 'Gary Todd', license: 'CC0', page: 'https://commons.wikimedia.org/wiki/File:Vatican_Sistine_Chapel_Ceiling_(9808850053).jpg' },
  { id: 'poi-st-peters-basilica', file: 'File:St Peter facade.jpg', author: 'Livioandronico2013', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:St_Peter_facade.jpg' },
];

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
