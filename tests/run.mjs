import assert from 'node:assert/strict';
import { normalise } from '../scripts/lib/schema.mjs';
import { convert as osm } from '../scripts/sources/osm.mjs';
import { parseCsv, convert as od } from '../scripts/sources/opendata-swiss.mjs';
import { convert as mun } from '../scripts/sources/municipal.mjs';

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
console.log('all tests passed');
