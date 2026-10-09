const UA = { 'User-Agent': 'swiss-kids-activities (github.com/svedaprakash-afk/shiny-broccoli)' };
const show = (t, n = 300) => String(t).slice(0, n).replace(/\s+/g, ' ');
const get = async (u, o = {}) => { try { const r = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000), ...o }); return { s: r.status, t: await r.text(), ct: r.headers.get('content-type') }; } catch (e) { return { s: 0, t: String(e.message) }; } };
const sec = n => console.log(`\n===== ${n}`);

sec('Zürich Tourismus API: category stats + family entries');
for (const id of [193, 190, 191, 192, 194, 195, 196, 197, 198, 199, 200]) {
  const r = await get(`https://www.zuerich.com/en/api/v2/data?id=${id}`);
  let j; try { j = JSON.parse(r.t); } catch { console.log(id, r.s, 'not json', show(r.t, 80)); continue; }
  const cats = {}; for (const it of j) for (const k of Object.keys(it.category || {})) cats[k] = (cats[k] || 0) + 1;
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e.join(':')).join(' ');
  const geo = j.find(i => i.geo)?.geo;
  console.log(id, 'items', j.length, '| type', j[0]?.['@type'], '| first', j[0]?.name?.en, '| geo', JSON.stringify(geo), '| lic', j[0]?.license, '|', top);
}

sec('Wikidata class labels');
{ const ids = 'Q43501 Q194195 Q2281788 Q167346 Q1503120 Q2631351 Q1068432 Q1501 Q17140 Q8502 Q1055143 Q2977 Q4989906 Q21198342'.split(' ');
  const q = `SELECT ?c ?l (COUNT(?i) AS ?n) WHERE { VALUES ?c { ${ids.map(i => 'wd:' + i).join(' ')} } ?c rdfs:label ?l FILTER(lang(?l)="en") OPTIONAL { ?i wdt:P31 ?c; wdt:P17 wd:Q39 } } GROUP BY ?c ?l`;
  const r = await get('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
  try { for (const b of JSON.parse(r.t).results.bindings) console.log(b.c.value.split('/').pop(), b.l.value, b.n.value); } catch { console.log(r.s, show(r.t)); } }

sec('Municipal / tourism pages: JSON-LD + robots');
const pages = ['https://www.zuerich.com/en/visit/families', 'https://www.zuerich.com/de/besuchen/familie', 'https://www.basel.com/de/familie', 'https://www.luzern.com/de/familie',
  'https://www.bern.com/de/familie', 'https://www.stadt-zuerich.ch/de/kultur-und-freizeit.html', 'https://www.stadtbibliothekbasel.ch', 'https://www.winterthur.ch/themen/freizeit-und-kultur',
  'https://www.stgallen-bodensee.ch/de/familie', 'https://www.lugano-tourism.ch/en/families', 'https://www.geneve.com/fr/familles', 'https://www.lausanne-tourisme.ch/fr/famille',
  'https://www.jugendarbeit.ch', 'https://www.ferienpass.ch', 'https://www.kinderbuchhandlung.ch'];
for (const u of pages) {
  const o = new URL(u); const rb = await get(`${o.origin}/robots.txt`); const r = await get(u);
  const ld = [...r.t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set(); for (const m of ld) { try { const j = JSON.parse(m[1]); for (const n of Array.isArray(j) ? j : j['@graph'] || [j]) types.add([].concat(n['@type']).join('/')); } catch {} }
  const dis = (rb.t.match(/User-agent:\s*\*[\s\S]*?(?=User-agent:|$)/i) || [''])[0].split('\n').filter(l => /^disallow/i.test(l)).slice(0, 4).join(' ');
  console.log(u, r.s, 'ld+json:', ld.length, [...types].join(','), '| robots', rb.s, show(dis, 120));
}
