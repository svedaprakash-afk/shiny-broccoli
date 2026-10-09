// Merge seed + scraped sources + approved community submissions -> docs/data/activities.json
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { normalise, normaliseImage } from './lib/schema.mjs';

const readJson = async p => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return p.endsWith('images.json') ? {} : []; } };
const srcDir = 'data/sources';
const files = (await readdir(srcDir).catch(() => [])).filter(f => f.endsWith('.json'));
const lists = [];
for (const f of files) lists.push(...(await readJson(`${srcDir}/${f}`)).map(a => normalise(a, a.source || f.replace('.json', ''))));
lists.push(...(await readJson('data/seed.json')).map(a => normalise(a, 'seed')));
lists.push(...(await readJson('data/community.json')).map(a => normalise(a, 'community')));

// Attach openly licensed pictures resolved by commons.mjs (keyed by activity id). Items that already have images keep them.
const images = (await readJson('data/images.json')) || {};
for (const a of lists) if (a && !a.images && !Array.isArray(images) && images[a.id]) a.images = images[a.id].map(normaliseImage).filter(Boolean);

// Dedupe: same normalised name within ~150 m. Community/seed (curated) win over scraped.
const rank = { community: 0, seed: 1, municipal: 2, myswitzerland: 3, 'opendata.swiss': 4, osm: 5 };
const sorted = lists.filter(Boolean).sort((a, b) => (rank[a.source] ?? 9) - (rank[b.source] ?? 9));
const seen = new Map(), out = [];
const key = a => a.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
for (const a of sorted) {
  const k = key(a), near = seen.get(k) || [];
  const dup = near.find(b => Math.abs(b.lat - a.lat) < 0.0014 && Math.abs(b.lon - a.lon) < 0.002);
  if (dup) { if (!dup.images?.length && a.images?.length) dup.images = a.images; continue; }
  near.push(a); seen.set(k, near); out.push(a);
}
await writeFile('docs/data/activities.json', JSON.stringify({ generated: new Date().toISOString(), count: out.length, activities: out }));
console.log(`built ${out.length} activities (from ${lists.filter(Boolean).length})`);
