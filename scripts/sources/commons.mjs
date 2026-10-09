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

// ---- Wikidata places with a photo (zoos, amusement parks, aquariums) matched to our entries by name AND location ----
const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ');
const STOP = new Set(['zoo', 'park', 'der', 'die', 'das', 'the', 'les', 'des', 'del', 'dei', 'und', 'and', 'von', 'zur', 'museum', 'parc', 'parco', 'bad', 'schwimmbad']);
const tokens = t => new Set(norm(t).split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)));
const km = (a, b) => { const r = x => x * Math.PI / 180, h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

/** Pairs a Wikidata place with an activity only if it is within 500 m AND their distinctive name words overlap. Exported for tests. */
export function matchCandidates(acts, cands) {
  const out = {};
  for (const c of cands) {
    const ct = tokens(c.name);
    if (!ct.size) continue;
    for (const a of acts) {
      if (out[a.id] || km(a, c) > 0.5) continue;
      const at = tokens(a.name), shared = [...ct].filter(w => at.has(w)).length;
      if (shared && shared >= Math.min(ct.size, at.size) / 2) out[a.id] = c.file;
    }
  }
  return out;
}

/** Wikidata items' P18 value arrives as a Special:FilePath URL. */
export const fileFromUrl = u => { const m = String(u).match(/Special:FilePath\/(.+)$/); return m ? 'File:' + decodeURIComponent(m[1]).replace(/_/g, ' ') : null; };

async function wikidataPlaces() {
  const q = `SELECT ?iLabel ?coord ?img WHERE { VALUES ?c { wd:Q43501 wd:Q194195 wd:Q2281788 }
    ?i wdt:P31 ?c; wdt:P17 wd:Q39; wdt:P625 ?coord; wdt:P18 ?img. SERVICE wikibase:label { bd:serviceParam wikibase:language "de,fr,it,en". } }`;
  try {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { ...UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).results.bindings.map(b => {
      const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      return m && { name: b.iLabel.value, lon: +m[1], lat: +m[2], file: fileFromUrl(b.img.value) };
    }).filter(c => c && c.file);
  } catch (e) { console.warn(`wikidata places failed: ${e.message}`); return []; }
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
  // Second route: Wikidata places matched to our entries by name and proximity.
  const acts = JSON.parse(await readFile('docs/data/activities.json', 'utf8').catch(() => '{"activities":[]}')).activities;
  const places = await wikidataPlaces();
  const matched = matchCandidates(acts, places);
  console.log(`wikidata places: ${places.length} with a photo, ${Object.keys(matched).length} matched to our entries`);
  const titles = [...new Set([...Object.values(refs).map(titleOf), ...Object.values(matched)].filter(Boolean))];
  const imgs = await commonsImages(titles);
  const out = { ...prev };
  let n = 0;
  for (const [id, r] of Object.entries(refs)) {
    const t = titleOf(r), img = t && imgs[t];
    if (img) { out[id] = [img]; n++; }
  }
  for (const [id, title] of Object.entries(matched)) if (imgs[title] && !out[id]) { out[id] = [imgs[title]]; n++; }
  await mkdir('data', { recursive: true });
  await writeFile('data/images.json', JSON.stringify(out));
  console.log(`commons: ${titles.length} files looked up for ${Object.keys(refs).length} refs; ${n} openly licensed images attached`);
}
