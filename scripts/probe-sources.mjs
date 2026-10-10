// Diagnostic: inspects candidate public endpoints so ingestion can be written against real responses.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const UA = { 'User-Agent': 'swiss-kids-activities (github.com/svedaprakash-afk/shiny-broccoli)' };
const show = (t, n = 600) => String(t).slice(0, n).replace(/\s+/g, ' ');
async function get(url, opts = {}) {
  try { const r = await fetch(url, { headers: UA, ...opts }); const t = await r.text(); return { s: r.status, t, ct: r.headers.get('content-type') }; }
  catch (e) { return { s: 0, t: String(e.message) }; }
}
const section = n => console.log(`\n===== ${n}`);

for (const [name, base] of [['Bern', 'https://map.bern.ch/arcgis/services/Geoportal/Spielplaetze/MapServer/WFSServer'],
                            ['Winterthur', 'https://stadtplan.winterthur.ch/wfs/Spielplatzkataster']]) {
  section(`WFS ${name} capabilities`);
  const c = await get(`${base}?service=WFS&request=GetCapabilities`);
  console.log(c.s, show(c.t, 200));
  const names = [...c.t.matchAll(/<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/g)].map(m => m[1]);
  console.log('names:', names.slice(0, 12));
  const ft = names.find(n => !/WFS|OGC|^$/.test(n) && n !== 'WFS') || names[1];
  for (const fmt of ['GeoJSON', 'application/json', 'geojson']) {
    const q = `${base}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(ft)}&outputFormat=${encodeURIComponent(fmt)}&srsName=EPSG:4326&count=3`;
    const g = await get(q); console.log(`GetFeature[${ft}][${fmt}]`, g.s, g.ct, show(g.t));
    if (g.s === 200 && g.t.trim().startsWith('{')) break;
  }
}

section('Zürich playground WFS/OGD');
for (const u of ['https://www.ogd.stadt-zuerich.ch/wfs/geoportal/POI_oeffentliche_Spielplaetze?service=WFS&request=GetCapabilities',
                 'https://www.stadt-zuerich.ch/geodaten/download/POI_oeffentliche_Spielplaetze?format=geojson',
                 'https://www.stadt-zuerich.ch/geodaten/download/POI_oeffentliche_Spielplaetze?format=10009']) {
  const r = await get(u); console.log(u, r.s, r.ct, show(r.t, 300));
  const names = [...r.t.matchAll(/<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/g)].map(m => m[1]); if (names.length) console.log('names:', names.slice(0, 10));
}

section('Luzern zip');
try {
  mkdirSync('/tmp/lu', { recursive: true });
  const z = await fetch('https://map.stadtluzern.ch/ogd/ogddownload/gis/citymaps/citymaps_poi/citymaps_spielplatz_json.zip', { headers: UA });
  console.log('status', z.status); writeFileSync('/tmp/lu/a.zip', Buffer.from(await z.arrayBuffer()));
  console.log(execFileSync('unzip', ['-l', '/tmp/lu/a.zip']).toString());
  const files = execFileSync('unzip', ['-Z1', '/tmp/lu/a.zip']).toString().split('\n').filter(f => /json$/i.test(f));
  for (const f of files.slice(0, 1)) console.log(f, show(execFileSync('unzip', ['-p', '/tmp/lu/a.zip', f]).toString(), 900));
} catch (e) { console.log('luzern failed', e.message); }

section('Biel json');
{ const r = await get('https://sig.biel-bienne.ch/datastore/E331_Spielplaetze_und_geraete-Places_de_jeux_et_equipements/e331_spielplaetze_und_geraete.json');
  console.log(r.s, r.t.length);
  try { const j = JSON.parse(r.t); for (const [k, v] of Object.entries(j)) console.log(k, v.features?.length, JSON.stringify(v.features?.[0]?.properties || {}).slice(0, 500), JSON.stringify(v.features?.[0]?.geometry || {}).slice(0, 150)); } catch (e) { console.log(show(r.t)); } }

section('Zuerich Tourismus API');
{ const r = await get('https://www.zuerich.com/en/api/v2/data?id=193'); console.log(r.s, r.ct, r.t.length, show(r.t, 1200)); }

section('Wikidata SPARQL (children-relevant places in CH)');
{ const q = `SELECT ?i ?iLabel ?c ?cl WHERE { VALUES ?c { wd:Q43501 wd:Q33506 wd:Q2281788 wd:Q4482682 wd:Q1068432 } ?i wdt:P31 ?c; wdt:P17 wd:Q39; wdt:P625 ?co. SERVICE wikibase:label { bd:serviceParam wikibase:language "de,fr,it,en". } } LIMIT 5`;
  const r = await get('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)); console.log(r.s, show(r.t, 600)); }
