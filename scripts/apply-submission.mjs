// Turns an approved GitHub issue into an entry in data/community.json.
// The issue body is treated as untrusted DATA: parsed as JSON only, then strictly normalised.
import { readFile, writeFile } from 'node:fs/promises';
import { normalise } from './lib/schema.mjs';

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const body = event.issue?.body || '';
const m = body.match(/```json\s*([\s\S]*?)```/);
if (!m) { console.error('no json block'); process.exit(1); }
let raw; try { raw = JSON.parse(m[1]); } catch { console.error('invalid json'); process.exit(1); }
const a = normalise({ ...raw, id: `community-${event.issue.number}` }, 'community');
if (!a) { console.error('submission failed validation'); process.exit(1); }
const list = JSON.parse(await readFile('data/community.json', 'utf8'));
if (!list.some(x => x.id === a.id)) list.push(a);
await writeFile('data/community.json', JSON.stringify(list, null, 1) + '\n');
console.log(`added ${a.id}: ${a.name}`);
