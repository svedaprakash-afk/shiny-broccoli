// Turns an approved GitHub issue into an entry in data/community.json (+ copies its photos into docs/img/community).
// The issue body is treated as untrusted DATA: parsed as JSON only, then strictly normalised.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { normalise, normaliseImage } from './lib/schema.mjs';
import { geocode } from './lib/geocode.mjs';
import { extractAttachmentUrls, download, sniff, sanitize, PHOTO_LICENSES } from './lib/images.mjs';

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue, body = issue?.body || '';
const m = body.match(/```json\s*([\s\S]*?)```/);
if (!m) { console.error('no json block'); process.exit(1); }
let raw; try { raw = JSON.parse(m[1]); } catch { console.error('invalid json'); process.exit(1); }

// Location: coordinates win; otherwise geocode the address with swisstopo (first match; the moderator sees the result in the commit).
if (!(Number(raw.lat) && Number(raw.lon))) {
  const q = [raw.address, raw.city].filter(Boolean).join(', ');
  if (!q) { console.error('no coordinates and no address'); process.exit(1); }
  const hit = (await geocode(q, 1))[0];
  if (!hit) { console.error(`address not found: ${q}`); process.exit(1); }
  raw.lat = hit.lat; raw.lon = hit.lon;
  console.log(`geocoded "${q}" -> ${hit.label} (${hit.lat}, ${hit.lon})`);
}

// Photos: only if the submitter ticked the rights box, named a credit and picked one of the allowed open licences.
const images = [];
const p = raw.photo;
if (p && p.rights === true && p.credit && PHOTO_LICENSES.includes(p.license)) {
  const urls = extractAttachmentUrls(body);
  await mkdir('docs/img/community', { recursive: true });
  for (const [i, url] of urls.entries()) {
    try {
      const buf = await download(url), ext = sniff(buf);
      if (!ext) throw new Error('not a JPEG/PNG');
      const file = `${issue.number}-${i + 1}.${ext}`;
      await writeFile(`docs/img/community/${file}`, await sanitize(buf, ext));
      const img = normaliseImage({ url: `img/community/${file}`, credit: p.credit, license: p.license, source: issue.html_url });
      if (img) images.push(img);
    } catch (e) { console.warn(`photo ${i + 1} skipped: ${e.message}`); }
  }
} else if (extractAttachmentUrls(body).length) console.warn('photos present but rights/credit/licence missing: not published');

const a = normalise({ ...raw, images, id: `community-${issue.number}` }, 'community');
if (!a) { console.error('submission failed validation'); process.exit(1); }
const list = JSON.parse(await readFile('data/community.json', 'utf8'));
if (!list.some(x => x.id === a.id)) list.push(a);
await writeFile('data/community.json', JSON.stringify(list, null, 1) + '\n');
console.log(`added ${a.id}: ${a.name} (${images.length} photo(s))`);
