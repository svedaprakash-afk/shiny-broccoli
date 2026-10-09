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

// municipal JSON-LD
const html = '<script type="application/ld+json">{"@type":"Event","name":"Kindertheater","location":{"geo":{"latitude":46.95,"longitude":7.45}}}</script>';
assert.equal(mun({ id: 'b', url: 'https://x', defaults: { city: 'Bern' } }, html)[0].city, 'Bern');
console.log('all tests passed');
