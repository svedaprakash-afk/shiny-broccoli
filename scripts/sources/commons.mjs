// Resolves picture pointers (Commons file names, Wikidata P18) into licensed, credited images.
// Only CC0 / CC BY / CC BY-SA / public domain are kept. Pictures are hot-linked from Wikimedia, never copied.
// Output: data/images.json  { activityId: [{url, credit, license, source}] }
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { normaliseImage } from '../lib/schema.mjs';

const UA = { 'User-Agent': 'swiss-kids-activities (github.com/svedaprakash-afk/shiny-broccoli)' };
const strip = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** One Commons imageinfo page -> image object, or null if not openly licensed. Exported for tests. */
export function pickImage(page) {
  const ii = page?.imageinfo?.[0], m = ii?.extmetadata || {};
  if (!ii?.thumburl) return null;
  if (strip(m.NonFree?.value) || strip(m.Restrictions?.value)) return null;
  const license = strip(m.LicenseShortName?.value).replace(/\s+[a-z]{2}$/, ''); // "CC BY-SA 3.0 de" -> "CC BY-SA 3.0"
  return normaliseImage({
    url: ii.thumburl, license,
    credit: strip(m.Artist?.value).slice(0, 120) || 'Unknown author (Wikimedia Commons)',
    source: ii.descriptionurl,
  });
}

async function json(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function wikidataFiles(ids) {
  const out = {};
  for (const part of chunks(ids, 50)) {
    try {
      const j = await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=claims&format=json`);
      for (const [id, e] of Object.entries(j.entities || {})) {
        const v = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (typeof v === 'string') out[id] = 'File:' + v;
      }
    } catch (e) { console.warn(`wikidata batch failed: ${e.message}`); }
  }
  return out;
}

async function commonsImages(titles) {
  const out = {};
  for (const part of chunks(titles, 40)) {
    try {
      const q = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '640',
        iiextmetadatafilter: 'Artist|LicenseShortName|NonFree|Restrictions', titles: part.join('|') });
      const j = await json(`https://commons.wikimedia.org/w/api.php?${q}`);
      const norm = Object.fromEntries((j.query?.normalized || []).map(n => [n.to, n.from]));
      for (const p of Object.values(j.query?.pages || {})) {
        const img = pickImage(p);
        if (img) { out[p.title] = img; if (norm[p.title]) out[norm[p.title]] = img; }
      }
    } catch (e) { console.warn(`commons batch failed: ${e.message}`); }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const refs = JSON.parse(await readFile('data/refs/osm-refs.json', 'utf8').catch(() => '{}'));
  const prev = JSON.parse(await readFile('data/images.json', 'utf8').catch(() => '{}'));
  const wdIds = [...new Set(Object.values(refs).map(r => r.wd).filter(Boolean))];
  const wdFiles = await wikidataFiles(wdIds);
  const titleOf = r => r.file || (r.wd && wdFiles[r.wd]);
  const titles = [...new Set(Object.values(refs).map(titleOf).filter(Boolean))];
  const imgs = await commonsImages(titles);
  const out = { ...prev };
  let n = 0;
  for (const [id, r] of Object.entries(refs)) {
    const t = titleOf(r), img = t && imgs[t];
    if (img) { out[id] = [img]; n++; }
  }
  await mkdir('data', { recursive: true });
  await writeFile('data/images.json', JSON.stringify(out));
  console.log(`commons: ${titles.length} files looked up for ${Object.keys(refs).length} refs; ${n} openly licensed images attached`);
}
