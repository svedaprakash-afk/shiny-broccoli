// opendata.swiss (CKAN). Datasets are heterogeneous, so we only ingest datasets that are
// explicitly allow-listed in data/opendata-resources.json with a column mapping.
// Entry: { "name": "...", "url": "<csv/json url>", "format": "csv|geojson", "map": { "name": "COL", "lat": "COL", "lon": "COL" }, "defaults": { "category": "playground", "cost": "free" } }
import { readFile, writeFile } from 'node:fs/promises';
import { normalise } from '../lib/schema.mjs';

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

export function convert(entry, text) {
  const recs = entry.format === 'geojson'
    ? JSON.parse(text).features.map(f => ({ ...f.properties, __lon: f.geometry?.coordinates?.[0], __lat: f.geometry?.coordinates?.[1] }))
    : parseCsv(text);
  const m = entry.map;
  return recs.map((r, i) => normalise({
    ...entry.defaults,
    id: `od-${entry.id}-${i}`,
    name: r[m.name], city: m.city && r[m.city], url: m.url && r[m.url],
    lat: m.lat === '__lat' ? r.__lat : r[m.lat], lon: m.lon === '__lon' ? r.__lon : r[m.lon],
  }, 'opendata.swiss')).filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = JSON.parse(await readFile('data/opendata-resources.json', 'utf8'));
  const all = [];
  for (const e of entries) {
    try {
      const res = await fetch(e.url); if (!res.ok) throw new Error(res.status);
      all.push(...convert(e, await res.text()));
    } catch (err) { console.warn(`opendata: skipped ${e.id}: ${err.message}`); }
  }
  await writeFile('data/sources/opendata-swiss.json', JSON.stringify(all));
  console.log(`opendata.swiss: ${all.length} activities from ${entries.length} datasets`);
}
