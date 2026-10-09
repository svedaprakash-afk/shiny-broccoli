// OpenStreetMap via Overpass (ODbL). Attribution required: © OpenStreetMap contributors.
import { writeFile, mkdir } from 'node:fs/promises';
import { normalise } from '../lib/schema.mjs';

const ENDPOINTS = (process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]);
// One small query per selector: the public servers 504 on a single large union.
const SELECTORS = [
  '["leisure"="playground"]["name"]',
  '["tourism"="zoo"]',
  '["tourism"="theme_park"]',
  '["leisure"="water_park"]',
  '["leisure"="trampoline_park"]',
  '["leisure"="miniature_golf"]',
  '["tourism"="museum"]["museum"="children"]',
  '["tourism"="museum"]["name"~"Kinder|enfants|bambini|children",i]',
  '["leisure"="swimming_pool"]["access"!~"private|customers"]["name"]["fee"]',
];
const query = (sel, bbox) => `[out:json][timeout:120];
area["ISO3166-1"="CH"][admin_level=2]->.ch;
nwr${sel}(area.ch)${bbox ? `(${bbox})` : ''};
out center tags;`;

// Heavy selectors are split into a 3x3 grid of boxes (still clipped to Switzerland by area.ch).
const grid = () => { const t = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
  t.push([45.8 + i * 0.7, 5.9 + j * 1.55, 45.8 + (i + 1) * 0.7, 5.9 + (j + 1) * 1.55].map(x => x.toFixed(3)).join(',')); return t; };
const TILED = new Set(['["leisure"="playground"]["name"]']);

const MAP = [
  [t => t.leisure === 'playground', { category: 'playground', kind: 'physical', difficulty: 'easy', free: true }],
  [t => t.tourism === 'zoo', { category: 'zoo', kind: 'both', difficulty: 'easy' }],
  [t => t.tourism === 'theme_park', { category: 'theme-park', kind: 'physical', difficulty: 'easy' }],
  [t => t.leisure === 'water_park' || t.leisure === 'swimming_pool', { category: 'water', kind: 'physical' }],
  [t => t.leisure === 'trampoline_park', { category: 'sport', kind: 'physical', difficulty: 'medium' }],
  [t => t.leisure === 'miniature_golf', { category: 'sport', kind: 'both', difficulty: 'easy' }],
  [t => t.tourism === 'museum', { category: 'museum', kind: 'mental', difficulty: 'easy' }],
];

export function convert(el) {
  const t = el.tags || {};
  const m = MAP.find(([f]) => f(t))?.[1];
  const name = t.name || t['name:de'] || t['name:fr'] || t['name:it'] || t['name:en'];
  if (!m || !name) return null;
  const cost = t.fee === 'no' ? 'free' : t.fee === 'yes' ? 'paid' : m.free ? 'free' : 'unknown';
  return normalise({
    id: `osm-${el.type[0]}${el.id}`, name, category: m.category, kind: m.kind, difficulty: m.difficulty, cost,
    lat: el.lat ?? el.center?.lat, lon: el.lon ?? el.center?.lon,
    city: t['addr:city'], url: t.website || t['contact:website'],
    languages: [], // OSM has no reliable language data: empty = language-independent
  }, 'osm');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(sel, bbox) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query(sel, bbox) }),
        headers: { 'User-Agent': 'swiss-kids-activities (github.com/svedaprakash-afk/shiny-broccoli)' } });
      if (res.ok) return (await res.json()).elements;
      console.warn(`osm ${sel}: ${url} -> HTTP ${res.status}`);
    } catch (e) { console.warn(`osm ${sel}: ${url} -> ${e.message}`); }
    await sleep(3000 * (attempt + 1));
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const items = new Map(); let failed = 0;
  for (const sel of SELECTORS) {
    let els = [];
    for (const bbox of TILED.has(sel) ? grid() : [undefined]) {
      const r = await run(sel, bbox);
      if (!r) { failed++; continue; }
      els.push(...r); if (bbox) await sleep(1000);
    }
    for (const el of els) { const a = convert(el); if (a) items.set(a.id, a); }
    console.log(`osm ${sel}: ${els.length} elements`);
    await sleep(1500);
  }
  if (!items.size) throw new Error('osm: no data retrieved');
  await mkdir('data/sources', { recursive: true });
  await writeFile('data/sources/osm.json', JSON.stringify([...items.values()]));
  console.log(`osm: ${items.size} activities (${failed} queries failed)`);
}
