import assert from 'node:assert/strict';
import { normalise } from '../scripts/lib/schema.mjs';
import { convert as osm } from '../scripts/sources/osm.mjs';
import { parseCsv, convert as od } from '../scripts/sources/opendata-swiss.mjs';
import { convert as mun, robotsAllows } from '../scripts/sources/municipal.mjs';

// schema rejects out-of-Switzerland and unnamed, strips markup, blocks javascript: URLs
assert.equal(normalise({ name: 'x', lat: 48.8, lon: 2.3 }, 't'), null);
assert.equal(normalise({ name: '', lat: 47, lon: 8 }, 't'), null);
const n = normalise({ name: '<b>Zoo</b>', lat: 47, lon: 8, url: 'javascript:alert(1)', cost: 'bogus', languages: ['de', 'xx'] }, 't');
assert.ok(!/[<>]/.test(n.name));
assert.equal(n.url, ''); assert.equal(n.cost, 'unknown'); assert.deepEqual(n.languages, ['de']);

// OSM
const p = osm({ type: 'node', id: 1, lat: 47.37, lon: 8.54, tags: { leisure: 'playground', name: 'Spielplatz A' } });
assert.equal(p.cost, 'free'); assert.equal(p.category, 'playground');
const z = osm({ type: 'way', id: 2, center: { lat: 47.38, lon: 8.57 }, tags: { tourism: 'zoo', name: 'Zoo', fee: 'yes' } });
assert.equal(z.cost, 'paid');
assert.equal(osm({ type: 'node', id: 3, lat: 47, lon: 8, tags: { leisure: 'playground' } }), null);

// opendata CSV + GeoJSON
assert.deepEqual(parseCsv('a;b\n"x;1";2\n'), [{ a: 'x;1', b: '2' }]);
const e = { id: 't', format: 'csv', map: { name: 'n', lat: 'la', lon: 'lo' }, defaults: { category: 'playground' } };
assert.equal(od(e, 'n,la,lo\nPark,47.1,8.2\nBad,10,10\n').length, 1);
const g = { id: 'g', format: 'geojson', map: { name: 'name', lat: '__lat', lon: '__lon' }, defaults: {} };
assert.equal(od(g, JSON.stringify({ features: [{ properties: { name: 'G' }, geometry: { coordinates: [8.2, 47.1] } }] }))[0].lat, 47.1);

const gf = { id: 'f', format: 'geojson', filter: { kid: 'TRUE' }, map: { name: 'name', lat: '__lat', lon: '__lon' }, defaults: {} };
assert.equal(od(gf, JSON.stringify({ features: [
  { properties: { name: 'A', kid: 'TRUE' }, geometry: { coordinates: [8.2, 47.1] } },
  { properties: { name: 'B', kid: 'FALSE' }, geometry: { coordinates: [8.2, 47.1] } }] })).length, 1);

import { lv95ToWgs84 } from '../scripts/lib/geo.mjs';
const [la, lo] = lv95ToWgs84(2600000, 1200000);   // old Bern observatory: 46.95108, 7.43864
assert.ok(Math.abs(la - 46.95108) < 1e-4 && Math.abs(lo - 7.43864) < 1e-4);
const lu = { id: 'lu', format: 'geojson', crs: 'EPSG:2056', map: { name: 'NAME', lat: '__lat', lon: '__lon' }, defaults: {} };
const luOut = od(lu, JSON.stringify({ features: [{ properties: { NAME: 'Spielplatz X' }, geometry: { type: 'Point', coordinates: [2665967.9, 1210681.9] } }] }));
assert.ok(Math.abs(luOut[0].lat - 47.05) < 0.05 && Math.abs(luOut[0].lon - 8.31) < 0.05);   // Luzern
const bl = { id: 'bl', format: 'geojson', layer: 'p', crs: 'EPSG:2056', map: { name: 'name', lat: '__lat', lon: '__lon' }, defaults: {} };
const poly = { type: 'Polygon', coordinates: [[[2586274, 1219388], [2586298, 1219325], [2586341, 1219341], [2586274, 1219388]]] };
assert.equal(od(bl, JSON.stringify({ p: { features: [{ properties: { name: 'Crystalpark' }, geometry: poly }] } })).length, 1);
const be = { id: 'be', format: 'geojson', swapAxes: true, map: { name: 'N', description: 'D', url: 'U', lat: '__lat', lon: '__lon' }, defaults: {} };
const beOut = od(be, JSON.stringify({ features: [{ properties: { N: 'Bern PL', D: 'x', U: 'null' }, geometry: { type: 'Point', coordinates: [46.95783, 7.43243] } }] }))[0];
assert.equal(beOut.lat, 46.95783); assert.equal(beOut.url, '');

// municipal JSON-LD
const html = '<script type="application/ld+json">{"@type":"Event","name":"Kindertheater","location":{"geo":{"latitude":46.95,"longitude":7.45}}}</script>';
assert.equal(mun({ id: 'b', url: 'https://x', defaults: { city: 'Bern' } }, html)[0].city, 'Bern');
assert.equal(robotsAllows('User-agent: *\nDisallow: /private\n', '/private/x'), false);
assert.equal(robotsAllows('User-agent: *\nDisallow: /private\n', '/events'), true);

// ---- fee, sport, address, images ----
import { normaliseImage } from '../scripts/lib/schema.mjs';
import { sportOf, feeOf, refsOf } from '../scripts/sources/osm.mjs';
import { pickImage, matchCandidates, fileFromUrl } from '../scripts/sources/commons.mjs';
import { parseResults } from '../scripts/lib/geocode.mjs';
import { extractAttachmentUrls, sniff, sanitize } from '../scripts/lib/images.mjs';

const paid = normalise({ name: 'Pool', lat: 47, lon: 8, cost: 'paid', feeMin: 5, feeMax: 12.5, feeNote: 'Kids free', sport: 'swimming', address: 'Seestrasse 1' }, 't');
assert.equal(paid.feeMin, 5); assert.equal(paid.feeMax, 12.5); assert.equal(paid.sport, 'swimming'); assert.equal(paid.address, 'Seestrasse 1');
assert.equal(normalise({ name: 'F', lat: 47, lon: 8, cost: 'free', feeMin: 5 }, 't').feeMin, undefined);           // free => no fee
assert.equal(normalise({ name: 'F', lat: 47, lon: 8, cost: 'paid', feeMin: 9, feeMax: 3 }, 't').feeMax, 9);       // max < min => collapsed
assert.equal(normalise({ name: 'F', lat: 47, lon: 8, cost: 'paid', feeMin: -4 }, 't').feeMin, undefined);          // negative rejected
assert.equal(normalise({ name: 'F', lat: 47, lon: 8, sport: 'curling' }, 't').sport, undefined);                   // unknown sport dropped

// images: licence + credit + host are all mandatory
const good = { url: 'https://upload.wikimedia.org/x/640px-a.jpg', credit: 'Jane Doe', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:a.jpg' };
assert.ok(normaliseImage(good));
assert.equal(normaliseImage({ ...good, license: 'CC BY-NC 4.0' }), null);          // non-commercial rejected
assert.equal(normaliseImage({ ...good, license: 'All rights reserved' }), null);
assert.equal(normaliseImage({ ...good, credit: '' }), null);                         // no credit, no image
assert.equal(normaliseImage({ ...good, url: 'https://evil.example/a.jpg' }), null);  // host not allow-listed
assert.equal(normaliseImage({ ...good, url: 'http://upload.wikimedia.org/a.jpg' }), null);
assert.equal(normaliseImage({ ...good, url: 'javascript:alert(1)' }), null);
assert.ok(normaliseImage({ ...good, url: 'img/community/12-1.jpg' }));
assert.equal(normaliseImage({ ...good, url: 'img/community/../../etc/passwd.jpg' }), null);
assert.equal(normalise({ name: 'I', lat: 47, lon: 8, images: [good, { ...good, license: 'nope' }] }, 't').images.length, 1);

// OSM
assert.equal(sportOf('soccer;basketball'), 'football'); assert.equal(sportOf('curling'), undefined);
assert.deepEqual(feeOf('CHF 10'), { feeMin: 10, feeMax: 10 }); assert.deepEqual(feeOf('5-12 CHF'), { feeMin: 5, feeMax: 12 });
assert.deepEqual(feeOf('10 EUR'), {}); assert.deepEqual(feeOf(undefined), {});
assert.deepEqual(refsOf({ tags: { wikimedia_commons: 'File:Zoo_Basel.jpg', wikidata: 'Q123' } }), { file: 'File:Zoo Basel.jpg', wd: 'Q123' });
assert.deepEqual(refsOf({ tags: { wikimedia_commons: 'Category:Zoo Basel' } }), {});     // categories are ambiguous: not used
const tr = osm({ type: 'node', id: 9, lat: 47.1, lon: 8.1, tags: { leisure: 'trampoline_park', name: 'Jump', fee: 'yes', charge: 'CHF 18', 'addr:street': 'Hauptstr.', 'addr:housenumber': '4' } });
assert.equal(tr.sport, 'trampoline'); assert.equal(tr.feeMin, 18); assert.equal(tr.address, 'Hauptstr. 4');

// Commons: only open licences, never non-free/restricted
const page = (lic, extra = {}) => ({ title: 'File:A.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/t/640px-A.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
  extmetadata: { Artist: { value: '<a href="//x">Anna &amp; Co</a>' }, LicenseShortName: { value: lic }, ...extra } }] });
assert.equal(pickImage(page('CC BY-SA 4.0')).credit, 'Anna & Co');
assert.equal(pickImage(page('CC BY-SA 3.0 de')).license, 'CC BY-SA 3.0');
assert.ok(pickImage(page('Public domain')));
assert.equal(pickImage(page('CC BY-NC 2.0')), null); assert.equal(pickImage(page('CC BY-ND 2.0')), null);
assert.equal(pickImage(page('CC BY 4.0', { Restrictions: { value: 'personality' } })), null);
assert.equal(pickImage(page('CC BY 4.0', { NonFree: { value: 'true' } })), null);
assert.equal(pickImage({ title: 'File:Missing.jpg', missing: '' }), null);

// Wikidata place -> activity matching needs BOTH proximity and a shared distinctive name word
const acts = [{ id: 'a1', name: 'Zoo Basel', lat: 47.547, lon: 7.578 }, { id: 'a2', name: 'Zoo Zürich', lat: 47.3855, lon: 8.5744 }, { id: 'a3', name: 'Kinderspielplatz Nord', lat: 47.5471, lon: 7.5781 }];
const m = matchCandidates(acts, [{ name: 'Zoologischer Garten Basel', lat: 47.5469, lon: 7.5779, file: 'File:Basel.jpg' },
  { name: 'Zoo Zürich', lat: 47.20, lon: 8.50, file: 'File:Far.jpg' }]);                       // right name, 20 km away: rejected
assert.deepEqual(m, { a1: 'File:Basel.jpg' });                                              // shared word "basel"; neighbour a3 not matched
assert.equal(fileFromUrl('http://commons.wikimedia.org/wiki/Special:FilePath/Zoo%20Basel_1.jpg'), 'File:Zoo Basel 1.jpg');

// geocoder response (shape verified against the live API on a GitHub runner)
const gr = parseResults({ results: [{ attrs: { label: 'Bahnhofstrasse 10 <b>8001 Zürich</b>', lat: 47.368183, lon: 8.540021 } }, { attrs: { label: 'x' } }] });
assert.equal(gr.length, 1); assert.equal(gr[0].label, 'Bahnhofstrasse 10 8001 Zürich'); assert.equal(gr[0].lat, 47.368183);

// photo handling
const ok = 'https://github.com/user-attachments/assets/123e4567-e89b-12d3-a456-426614174000';
assert.deepEqual(extractAttachmentUrls(`![a](${ok})\n![b](https://evil.example/x.png) <img src="https://user-images.githubusercontent.com/1/a.jpg">`), [ok, 'https://user-images.githubusercontent.com/1/a.jpg']);
assert.equal(extractAttachmentUrls('https://github.com/user-attachments/assets/not-a-uuid').length, 0);
assert.equal(sniff(Buffer.from('<html>not an image</html>')), null);
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
let haveIM = true; try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); } catch { haveIM = false; }
if (haveIM) {
  const d = mkdtempSync(tmpdir() + '/t-'), src = d + '/a.jpg';
  execFileSync('convert', ['-size', '3000x2000', 'xc:red', '-set', 'comment', 'GPS-SECRET-47.37,8.54', '-set', 'exif:GPSLatitude', '47/1', src]);
  const raw = readFileSync(src); assert.ok(raw.includes('GPS-SECRET'));
  const clean = await sanitize(raw, 'jpg');
  assert.ok(!clean.includes('GPS-SECRET'), 'metadata must be stripped');
  assert.equal(sniff(clean), 'jpg'); assert.ok(clean.length < raw.length);
  await assert.rejects(() => sanitize(Buffer.from('<?php echo 1; ?>'), 'jpg'));  // non-image never published
} else console.warn('ImageMagick missing: skipped sanitize test');
console.log('all tests passed');
