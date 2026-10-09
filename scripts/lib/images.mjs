// Handling of user-attached photos. Everything here treats the input as hostile.
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MAX_BYTES = 2 * 1024 * 1024;   // per photo
export const MAX_PHOTOS = 3;
export const PHOTO_LICENSES = ['CC BY-SA 4.0', 'CC BY 4.0', 'CC0 1.0'];

const ATTACH = [
  /https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}/g,
  /https:\/\/(?:user-images|private-user-images)\.githubusercontent\.com\/[\w/.%-]+\.(?:png|jpe?g)(?:\?[\w=&.%-]*)?/gi,
];

/** Only GitHub's own attachment URLs are ever fetched, so a submission cannot point us at arbitrary hosts. */
export function extractAttachmentUrls(body) {
  const found = new Set();
  for (const re of ATTACH) for (const m of String(body).matchAll(re)) found.add(m[0]);
  return [...found].slice(0, MAX_PHOTOS);
}

export function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

export async function download(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('photo larger than 2 MB');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('photo larger than 2 MB');
  return buf;
}

/**
 * Re-encode with ImageMagick: applies EXIF rotation, then drops ALL metadata (GPS location, camera, comments),
 * downsizes, and discards anything that is not a real image (polyglot files, embedded payloads).
 * The coder is forced (jpg:/png:) so a mislabelled file cannot select another decoder.
 */
export async function sanitize(buf, ext) {
  const dir = await mkdtemp(join(tmpdir(), 'photo-'));
  try {
    const inp = join(dir, `in.${ext}`), out = join(dir, `out.${ext}`);
    await writeFile(inp, buf);
    const bin = (() => { try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); return ['magick']; } catch { return ['convert']; } })();
    execFileSync(bin[0], [`${ext}:${inp}`, '-auto-orient', '-strip', '-resize', '1280x1280>', ...(ext === 'jpg' ? ['-quality', '82'] : []), `${ext}:${out}`],
      { timeout: 60000, stdio: 'ignore' });
    return await readFile(out);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
