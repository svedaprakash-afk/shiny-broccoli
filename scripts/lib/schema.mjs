// Shared activity schema: normalisation + strict validation for every source.
export const CATEGORIES = ['playground','zoo','museum','water','theme-park','sport','nature','workshop','event','other'];
export const COSTS = ['free','paid','unknown'];
export const KINDS = ['physical','mental','both'];
export const DIFFICULTIES = ['easy','medium','hard','unknown'];
export const LANGS = ['de','fr','it','en'];
export const SPORTS = ['football','basketball','swimming','climbing','skating','cycling','tennis','gymnastics','martial-arts','dance','skiing','athletics','trampoline','golf','multi','other'];

// Only openly licensed images are ever shown. NC/ND licences are rejected (we resize and show on a site that may be monetised).
export const LICENSE_RE = /^(CC0( 1\.0)?|CC BY(-SA)? [1-4]\.\d|Public domain|PDM 1\.0|Open Government Data[\w ,()-]*)$/i;
// Hosts we accept for hot-linked images. Community photos are copied into the repo (relative path) instead.
export const IMAGE_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];   // Wikimedia's image and thumbnail servers
const COMMUNITY_IMG = /^img\/community\/[\w.-]{1,80}\.(jpg|png)$/;

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function safeUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.slice(0, 500) : '';
  } catch { return ''; }
}

/** An image is kept only with a verifiable licence, a credit, an allowed host (or a repo-local path). */
export function normaliseImage(i) {
  if (!i || typeof i !== 'object') return null;
  const license = str(i.license, 60), credit = str(i.credit, 120);
  if (!LICENSE_RE.test(license) || !credit) return null;
  let url = '';
  if (typeof i.url === 'string' && COMMUNITY_IMG.test(i.url)) url = i.url;
  else { try { const u = new URL(i.url); if (u.protocol === 'https:' && IMAGE_HOSTS.includes(u.hostname)) url = u.href.slice(0, 500); } catch {} }
  if (!url) return null;
  return { url, credit, license, source: safeUrl(i.source) };
}

const money = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) / 100 : undefined; };

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
    address: str(a.address, 150),
    languages: [...new Set((Array.isArray(a.languages) ? a.languages : []).filter(l => LANGS.includes(l)))],
    url: safeUrl(a.url),
    source,
  };
  if (SPORTS.includes(a.sport)) out.sport = a.sport;
  if (out.cost !== 'free') {
    const lo = money(a.feeMin), hi = money(a.feeMax);
    if (lo !== undefined) { out.feeMin = lo; out.feeMax = hi !== undefined && hi >= lo ? hi : lo; }
    else if (hi !== undefined) { out.feeMin = hi; out.feeMax = hi; }
    const note = str(a.feeNote, 120); if (note) out.feeNote = note;
  }
  const imgs = (Array.isArray(a.images) ? a.images : []).map(normaliseImage).filter(Boolean).slice(0, 3);
  if (imgs.length) out.images = imgs;
  const min = Number(a.minAge), max = Number(a.maxAge);
  if (Number.isFinite(min) && min >= 0 && min <= 18) out.minAge = min;
  if (Number.isFinite(max) && max >= 0 && max <= 18) out.maxAge = max;
  return out;
}
