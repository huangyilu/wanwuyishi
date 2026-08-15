/**
 * 景点（POI）图片抓取：
 *   MODE=search   （默认）列出每个 POI 的自由版权候选，供人工挑选
 *   MODE=download 按 PICKS 表下载到 public/img/pois/{id}.jpg 并写 credits.json
 *
 * 来源 Wikimedia Commons，仅采用允许再分发的自由版权（CC0 / CC-BY / CC-BY-SA / 公有领域）。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';

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
const UA = 'wanwuyishi-travel/1.0 (https://github.com/huangyilu/wanwuyishi; contact: user@example.com)';

async function curlJson(url, attempt = 0) {
  try {
    const { stdout } = await exec('curl', ['-s', '-m', '40', '-4', '-A', UA, url], { maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (e) {
    if (attempt < 5) {
      await sleep(3500);
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

/** 下载到文件，校验大小（限流会返回空响应），过小则重试 */
async function curlDownload(url, dest, attempt = 0) {
  await exec('curl', ['-4', '-s', '-L', '-A', UA, '-m', '120', '-o', dest, url]);
  const sz = (await stat(dest)).size;
  if (sz < 1024 && attempt < 4) {
    await sleep(4000);
    return curlDownload(url, dest, attempt + 1);
  }
  return sz;
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
    for (const { id, file, author, license, page } of PICKS) {
      const [info] = await infos([file]);
      const url = info?.thumb || info?.url;
      if (!url) {
        console.log(`skip ${id}: no image url`);
        continue;
      }
      const dest = `${OUT}/${id}.jpg`;
      const sz = await curlDownload(url, dest);
      credits[id] = { src: `/img/pois/${id}.jpg`, author, license, page };
      console.log(`saved ${id} <- ${file} (${(sz / 1024).toFixed(0)} KB)`);
      await sleep(3000);
    }
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
];

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
