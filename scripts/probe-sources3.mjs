const UA = { 'User-Agent': 'swiss-kids-activities (github.com/svedaprakash-afk/shiny-broccoli)' };
const show = (t, n = 700) => String(t).slice(0, n).replace(/\s+/g, ' ');
const get = async u => { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) }); return { s: r.status, t: await r.text(), h: r.headers }; } catch (e) { return { s: 0, t: String(e.message) }; } };
const sec = n => console.log(`\n===== ${n}`);

sec('CKAN terms of use per dataset');
for (const id of ['spielplatze1', 'spielen-in-basel-spielplatze', 'kinder-und-jugendangebote', 'spielplatz-anlagen', 'spielplatze-standort-und-informationen', 'spielplatze-und-gerate', 'poi-offentliche-spielplatze']) {
  const r = await get(`https://ckan.opendata.swiss/api/3/action/package_show?id=${id}`);
  try {
    const d = JSON.parse(r.t).result;
    console.log(id, '| org:', d.organization?.title?.de || d.organization?.title, '| rights:', d.rights, '| license_id:', d.license_id, '| license_title:', d.license_title);
    for (const x of d.resources.slice(0, 3)) console.log('   res', x.format, '| rights:', x.rights, '| license:', x.license, '| ', show(x.download_url || x.url, 90));
  } catch { console.log(id, r.s, show(r.t, 150)); }
}

sec('swisstopo geocoder shape');
for (const q of ['Bahnhofstrasse 10 Zürich', 'Bundesplatz Bern', 'Rue du Rhône 1 Genève', 'Via Nassa 5 Lugano']) {
  const r = await get(`https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=${encodeURIComponent(q)}&type=locations&origins=address,zipcode,gg25&limit=3&sr=4326`);
  console.log(q, r.s, 'cors:', r.h?.get?.('access-control-allow-origin'), show(r.t, 700));
}

sec('Commons API shape');
{ const r = await get('https://commons.wikimedia.org/w/api.php?action=query&titles=File:Zoo%20Zürich%20Masoala%20Halle.jpg|File:Basel%20Zoo.jpg&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl&format=json');
  console.log(r.s, show(r.t, 1200)); }
sec('Wikidata P18 shape');
{ const r = await get('https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q18006|Q1020726&props=claims&format=json');
  try { const j = JSON.parse(r.t); for (const [k, v] of Object.entries(j.entities)) console.log(k, JSON.stringify(v.claims?.P18?.[0]?.mainsnak?.datavalue)); } catch { console.log(r.s, show(r.t)); } }
sec('Biel photo URL reachable?');
{ const r = await get('https://gis.biel-bienne.ch/img/e331_spielplaetze/spl-spielplatz_20230112085736661.jpg'); console.log(r.s, r.h?.get?.('content-type'), r.h?.get?.('content-length')); }
