// Prints candidate opendata.swiss datasets (title, licence, resource URLs, CSV/GeoJSON header)
// so a maintainer can allow-list them in data/opendata-resources.json with a column mapping.
const API = 'https://ckan.opendata.swiss/api/3/action/package_search';
const QUERIES = ['Spielplatz', 'Spielplätze', 'playground', 'Kinder Freizeit', 'Familie Freizeit', 'Schwimmbad', 'Badi', 'Zoo', 'Museum Kinder', 'Kinderanlass', 'Ferienpass', 'Jugend Freizeit'];
const txt = v => (v && typeof v === 'object' ? v.de || v.en || v.fr || v.it || '' : v || '');
const seen = new Set();
for (const q of QUERIES) {
  const res = await fetch(`${API}?q=${encodeURIComponent(q)}&rows=15`);
  if (!res.ok) { console.log(`## ${q}: HTTP ${res.status}`); continue; }
  const { result } = await res.json();
  console.log(`## ${q}: ${result.count} datasets`);
  for (const d of result.results) {
    if (seen.has(d.name)) continue; seen.add(d.name);
    console.log(`\n- ${txt(d.title)} [${d.name}] licence=${d.license_id || d.rights || '?'} org=${txt(d.organization?.title)}`);
    for (const r of d.resources.slice(0, 4)) {
      const url = r.download_url || r.url, fmt = (r.format || r.media_type || '').toUpperCase();
      console.log(`    ${fmt} ${url}`);
      if (/CSV|GEOJSON|JSON/.test(fmt) && /^https?:/.test(url || '')) {
        try {
          const f = await fetch(url, { headers: { Range: 'bytes=0-1500' } });
          console.log('      >', (await f.text()).slice(0, 700).replace(/\s+/g, ' '));
        } catch (e) { console.log('      > fetch failed', e.message); }
      }
    }
  }
}
