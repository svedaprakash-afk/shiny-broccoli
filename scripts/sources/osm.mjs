// OpenStreetMap via Overpass (ODbL). Attribution required: © OpenStreetMap contributors.
import { writeFile, mkdir } from 'node:fs/promises';
import { normalise } from '../lib/schema.mjs';

const ENDPOINT = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const QUERY = `[out:json][timeout:180];
area["ISO3166-1"="CH"][admin_level=2]->.ch;
(
  nwr["leisure"="playground"]["name"](area.ch);
  nwr["tourism"="zoo"](area.ch);
  nwr["tourism"="theme_park"](area.ch);
  nwr["leisure"="water_park"](area.ch);
  nwr["leisure"="trampoline_park"](area.ch);
  nwr["leisure"="miniature_golf"](area.ch);
  nwr["tourism"="museum"]["museum"="children"](area.ch);
  nwr["tourism"="museum"]["name"~"Kinder|enfants|bambini|children",i](area.ch);
  nwr["leisure"="swimming_pool"]["access"!~"private|customers"]["name"]["fee"](area.ch);
);
out center tags;`;

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

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams({ data: QUERY }),
    headers: { 'User-Agent': 'swiss-kids-activities (github.com/svedaprakash-afk/shiny-broccoli)' } });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const { elements } = await res.json();
  const items = elements.map(convert).filter(Boolean);
  await mkdir('data/sources', { recursive: true });
  await writeFile('data/sources/osm.json', JSON.stringify(items));
  console.log(`osm: ${items.length} activities`);
}
