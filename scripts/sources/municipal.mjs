// Municipal / library event pages. Only sources listed in data/municipal-sources.json are fetched,
// and only via structured data (schema.org JSON-LD "Event"/"Place"). No HTML-selector scraping:
// it is brittle, and many sites forbid it. Add a site only after checking its terms and robots.txt.
// Entry: { "id": "...", "url": "...", "defaults": { "city": "Bern", "languages": ["de"], "cost": "free" } }
import { readFile, writeFile } from 'node:fs/promises';
import { normalise } from '../lib/schema.mjs';

export function extractJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); out.push(...(Array.isArray(j) ? j : j['@graph'] || [j])); } catch { /* ignore */ }
  }
  return out;
}

export function convert(entry, html) {
  return extractJsonLd(html)
    .filter(n => /Event|Place|TouristAttraction/.test([].concat(n['@type']).join()))
    .map((n, i) => {
      const g = n.location?.geo || n.geo || {};
      return normalise({
        ...entry.defaults, id: `mun-${entry.id}-${i}`, name: n.name, description: n.description,
        lat: g.latitude, lon: g.longitude, url: n.url || entry.url, category: 'event',
      }, 'municipal');
    }).filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = JSON.parse(await readFile('data/municipal-sources.json', 'utf8'));
  const all = [];
  for (const e of entries) {
    try {
      const res = await fetch(e.url, { headers: { 'User-Agent': 'swiss-kids-activities (+github.com/svedaprakash-afk/shiny-broccoli)' } });
      if (!res.ok) throw new Error(res.status);
      all.push(...convert(e, await res.text()));
    } catch (err) { console.warn(`municipal: skipped ${e.id}: ${err.message}`); }
  }
  await writeFile('data/sources/municipal.json', JSON.stringify(all));
  console.log(`municipal: ${all.length} activities`);
}
