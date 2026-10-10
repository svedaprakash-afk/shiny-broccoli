// swisstopo geocoder (api3.geo.admin.ch): free, no key, Swiss addresses.
const API = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
const strip = s => String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Parse a SearchServer response into [{label, lat, lon}]. Exported for tests. */
export function parseResults(json) {
  return (json?.results || [])
    .map(r => ({ label: strip(r.attrs?.label || ''), lat: Number(r.attrs?.lat), lon: Number(r.attrs?.lon) }))
    .filter(r => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

export async function geocode(text, limit = 5, fetchImpl = fetch) {
  const q = new URLSearchParams({ searchText: text, type: 'locations', origins: 'address,zipcode,gg25', limit: String(limit), sr: '4326' });
  const res = await fetchImpl(`${API}?${q}`);
  if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
  return parseResults(await res.json());
}
