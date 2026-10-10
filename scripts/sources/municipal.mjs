// Municipal / library event pages. Only sources listed in data/municipal-sources.json are fetched,
// and only via structured data (schema.org JSON-LD "Event"/"Place"). No HTML-selector scraping:
// it is brittle, and many sites forbid it. Add a site only after checking its terms and robots.txt.
// Entry: { "id": "...", "url": "...", "defaults": { "city": "Bern", "languages": ["de"], "cost": "free" } }
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { normalise } from '../lib/schema.mjs';

export function extractJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); out.push(...(Array.isArray(j) ? j : j['@graph'] || [j])); } catch { /* ignore */ }
  }
  return out;
}

/** Minimal robots.txt check for User-agent: * (Disallow prefixes only; Allow overrides ignored = conservative). */
export function robotsAllows(robots, path) {
  const block = (robots.match(/user-agent:\s*\*[\s\S]*?(?=user-agent:|$)/i) || [''])[0];
  return !block.split('\n').some(l => { const m = l.match(/^\s*disallow:\s*(\S+)/i); return m && path.startsWith(m[1]); });
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
      const u = new URL(e.url);
      const rb = await fetch(`${u.origin}/robots.txt`).then(r => (r.ok ? r.text() : '')).catch(() => '');
      if (!robotsAllows(rb, u.pathname)) { console.warn(`municipal: ${e.id} disallowed by robots.txt`); continue; }
      const res = await fetch(e.url, { headers: { 'User-Agent': 'swiss-kids-activities (+github.com/svedaprakash-afk/shiny-broccoli)' } });
      if (!res.ok) throw new Error(res.status);
      all.push(...convert(e, await res.text()));
    } catch (err) { console.warn(`municipal: skipped ${e.id}: ${err.message}`); }
  }
  await mkdir('data/sources', { recursive: true });
  await writeFile('data/sources/municipal.json', JSON.stringify(all));
  console.log(`municipal: ${all.length} activities`);
}
