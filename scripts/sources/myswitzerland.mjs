// MySwitzerland Tourism Data Hub (opendata.myswitzerland.io). Requires a free API key in
// the MYSWITZERLAND_API_KEY secret; without it this source is skipped, not faked.
import { writeFile, mkdir } from 'node:fs/promises';
import { normalise } from '../lib/schema.mjs';

const KEY = process.env.MYSWITZERLAND_API_KEY;
const BASE = 'https://opendata.myswitzerland.io/v1';

export function convert(it) {
  const [lon, lat] = it.geo?.coordinates || [];
  const cats = JSON.stringify(it.classification || []).toLowerCase();
  return normalise({
    id: `mys-${it.identifier}`, name: it.name, description: it.abstract,
    lat, lon, url: it.url, category: /zoo|animal/.test(cats) ? 'zoo' : /museum/.test(cats) ? 'museum' : 'other',
    kind: /museum/.test(cats) ? 'mental' : 'physical', cost: 'unknown',
  }, 'myswitzerland');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!KEY) { console.log('myswitzerland: no API key, skipped'); process.exit(0); }
  const out = [];
  for (let page = 0; page < 50; page++) {
    const r = await fetch(`${BASE}/attractions?facets=*&hitsPerPage=50&page=${page}&lang=en`, { headers: { 'x-api-key': KEY } });
    if (!r.ok) { console.warn(`myswitzerland: HTTP ${r.status}`); break; }
    const { data } = await r.json();
    if (!data?.length) break;
    out.push(...data.map(convert).filter(Boolean));
  }
  await mkdir('data/sources', { recursive: true });
  await writeFile('data/sources/myswitzerland.json', JSON.stringify(out));
  console.log(`myswitzerland: ${out.length} activities`);
}
