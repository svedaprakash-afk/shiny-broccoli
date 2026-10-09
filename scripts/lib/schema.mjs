// Shared activity schema: normalisation + strict validation for every source.
export const CATEGORIES = ['playground','zoo','museum','water','theme-park','sport','nature','workshop','event','other'];
export const COSTS = ['free','paid','unknown'];
export const KINDS = ['physical','mental','both'];
export const DIFFICULTIES = ['easy','medium','hard','unknown'];
export const LANGS = ['de','fr','it','en'];

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max) : '');

export function safeUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.slice(0, 500) : '';
  } catch { return ''; }
}

/** Returns a clean activity or null if it is unusable. Never trusts input. */
export function normalise(a, source) {
  const name = str(a.name, 120);
  const lat = Number(a.lat), lon = Number(a.lon);
  // Rough bounding box of Switzerland (+ small margin) rejects bad coordinates.
  if (!name || !(lat >= 45.7 && lat <= 47.9 && lon >= 5.9 && lon <= 10.6)) return null;
  const out = {
    id: str(a.id, 80) || `${source}-${Math.round(lat * 1e4)}-${Math.round(lon * 1e4)}`,
    name,
    description: str(a.description, 400),
    category: pick(a.category, CATEGORIES, 'other'),
    cost: pick(a.cost, COSTS, 'unknown'),
    kind: pick(a.kind, KINDS, 'physical'),
    difficulty: pick(a.difficulty, DIFFICULTIES, 'unknown'),
    lat: +lat.toFixed(5), lon: +lon.toFixed(5),
    city: str(a.city, 60),
    languages: [...new Set((Array.isArray(a.languages) ? a.languages : []).filter(l => LANGS.includes(l)))],
    url: safeUrl(a.url),
    source,
  };
  const min = Number(a.minAge), max = Number(a.maxAge);
  if (Number.isFinite(min) && min >= 0 && min <= 18) out.minAge = min;
  if (Number.isFinite(max) && max >= 0 && max <= 18) out.maxAge = max;
  return out;
}
