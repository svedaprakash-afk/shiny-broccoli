// Swiss LV95 (EPSG:2056) -> WGS84 using swisstopo's approximate formulas (~1 m accuracy).
export function lv95ToWgs84(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3;
  return [lat * 100 / 36, lon * 100 / 36];
}

/** Reduce any GeoJSON geometry to one [x, y] point (centroid of vertices for polygons/lines). */
export function representativePoint(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  const pts = [];
  const walk = c => (typeof c[0] === 'number' ? pts.push(c) : c.forEach(walk));
  walk(g.type === 'MultiPolygon' ? g.coordinates[0] : g.coordinates);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}
