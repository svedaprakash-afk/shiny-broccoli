// opendata.swiss (CKAN). Datasets are heterogeneous, so we only ingest datasets that are
// explicitly allow-listed in data/opendata-resources.json with a column mapping.
// Optional: "layer" (key of a multi-layer GeoJSON), "crs": "EPSG:2056" (LV95 input), "swapAxes": true (coords are lat,lon),
// "zip": true (download is a zip holding one .json), "filter".
// Optional "filter": { "COL": "VALUE" } keeps only matching records.
// Entry: { "name": "...", "url": "<csv/json url>", "format": "csv|geojson", "map": { "name": "COL", "lat": "COL", "lon": "COL" }, "defaults": { "category": "playground", "cost": "free" } }
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalise } from '../lib/schema.mjs';
import { lv95ToWgs84, representativePoint } from '../lib/geo.mjs';

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

const clean = v => (v == null || v === 'null' || v === 'NULL' ? '' : v);

export function convert(entry, text) {
  let recs;
  if (entry.format === 'geojson') {
    let j = JSON.parse(text);
    if (entry.layer) j = j[entry.layer];
    recs = j.features.map(f => {
      const pt = representativePoint(f.geometry);
      let lat, lon;
      if (pt) {
        if (entry.crs === 'EPSG:2056') [lat, lon] = lv95ToWgs84(pt[0], pt[1]);
        else if (entry.swapAxes) [lat, lon] = pt; else [lon, lat] = pt;
      }
      return { ...f.properties, __lat: lat, __lon: lon };
    });
  } else recs = parseCsv(text);
  const m = entry.map;
  const keep = r => Object.entries(entry.filter || {}).every(([k, v]) => String(r[k]) === v);
  const out = recs.filter(keep).map((r, i) => normalise({
    ...entry.defaults,
    id: `od-${entry.id}-${i}`,
    name: r[m.name], description: m.description && clean(r[m.description]), city: m.city && clean(r[m.city]), url: m.url && clean(r[m.url]),
    lat: m.lat === '__lat' ? r.__lat : r[m.lat], lon: m.lon === '__lon' ? r.__lon : r[m.lon],
  }, 'opendata.swiss')).filter(Boolean);
  if (!out.length && recs.length) console.warn(`opendata: ${entry.id}: ${recs.length} records but 0 usable; sample keys: ${Object.keys(recs[0]).join(',')}`);
  return out;
}

async function fetchText(e) {
  const res = await fetch(e.url, { headers: { 'User-Agent': 'swiss-kids-activities (github.com/svedaprakash-afk/shiny-broccoli)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!e.zip) return res.text();
  const dir = await mkdtemp(join(tmpdir(), 'od-'));
  const zp = join(dir, 'a.zip'); await writeFile(zp, Buffer.from(await res.arrayBuffer()));
  const f = execFileSync('unzip', ['-Z1', zp]).toString().split('\n').find(n => /\.json$/i.test(n));
  if (!f) throw new Error('no .json in zip');
  return execFileSync('unzip', ['-p', zp, f], { maxBuffer: 64e6 }).toString();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = JSON.parse(await readFile('data/opendata-resources.json', 'utf8'));
  const all = [];
  for (const e of entries) {
    try {
      all.push(...convert(e, await fetchText(e)));
    } catch (err) { console.warn(`opendata: skipped ${e.id}: ${err.message}`); }
  }
  await mkdir('data/sources', { recursive: true });
  await writeFile('data/sources/opendata-swiss.json', JSON.stringify(all));
  console.log(`opendata.swiss: ${all.length} activities from ${entries.length} datasets`);
}
