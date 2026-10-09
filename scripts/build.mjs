// Merge seed + scraped sources + approved community submissions -> docs/data/activities.json
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { normalise } from './lib/schema.mjs';

const readJson = async p => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return []; } };
const srcDir = 'data/sources';
const files = (await readdir(srcDir).catch(() => [])).filter(f => f.endsWith('.json'));
const lists = [];
for (const f of files) lists.push(...(await readJson(`${srcDir}/${f}`)).map(a => normalise(a, a.source || f.replace('.json', ''))));
lists.push(...(await readJson('data/seed.json')).map(a => normalise(a, 'seed')));
lists.push(...(await readJson('data/community.json')).map(a => normalise(a, 'community')));

// Dedupe: same normalised name within ~150 m. Community/seed (curated) win over scraped.
const rank = { community: 0, seed: 1, municipal: 2, myswitzerland: 3, 'opendata.swiss': 4, osm: 5 };
const sorted = lists.filter(Boolean).sort((a, b) => (rank[a.source] ?? 9) - (rank[b.source] ?? 9));
const seen = new Map(), out = [];
const key = a => a.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
for (const a of sorted) {
  const k = key(a), near = seen.get(k) || [];
  if (near.some(b => Math.abs(b.lat - a.lat) < 0.0014 && Math.abs(b.lon - a.lon) < 0.002)) continue;
  near.push(a); seen.set(k, near); out.push(a);
}
await writeFile('docs/data/activities.json', JSON.stringify({ generated: new Date().toISOString(), count: out.length, activities: out }));
console.log(`built ${out.length} activities (from ${lists.filter(Boolean).length})`);
