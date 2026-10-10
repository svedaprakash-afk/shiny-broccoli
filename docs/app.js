import { T, CITIES } from './i18n.js';

const REPO = 'svedaprakash-afk/shiny-broccoli';
const PAGE = 50;
const $ = s => document.querySelector(s);
const state = { lang: 'en', pos: null, radius: 0, cost: new Set(), kind: new Set(), diff: new Set(), langs: new Set(), sports: new Set(), q: '', shown: PAGE, all: [] };

try { state.lang = localStorage.getItem('lang') || ''; } catch {}
if (!T[state.lang]) { const n = (navigator.language || 'en').slice(0, 2); state.lang = T[n] ? n : 'en'; }
const t = () => T[state.lang];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const dist = (a, b) => { const r = x => x * Math.PI / 180, dLa = r(b[0]-a[0]), dLo = r(b[1]-a[1]);
  const h = Math.sin(dLa/2)**2 + Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dLo/2)**2; return 12742 * Math.asin(Math.sqrt(h)); };

function chips(id, name, values, set, label) {
  $(id).innerHTML = values.map(v => `<label><input type="checkbox" value="${v}" ${set.has(v)?'checked':''}><span>${esc(label(v))}</span></label>`).join('');
  $(id).onchange = e => { e.target.checked ? set.add(e.target.value) : set.delete(e.target.value); state.shown = PAGE; render(); };
}

function filtered() {
  const q = state.q.toLowerCase();
  let list = state.all.filter(a =>
    (!state.cost.size || state.cost.has(a.cost)) &&
    (!state.kind.size || state.kind.has(a.kind) || (a.kind === 'both' && (state.kind.has('physical') || state.kind.has('mental')))) &&
    (!state.diff.size || state.diff.has(a.difficulty)) &&
    // No languages listed = language-independent (e.g. a playground), so it always matches.
    (!state.sports.size || state.sports.has(a.sport)) &&
    (!state.langs.size || !a.languages.length || a.languages.some(l => state.langs.has(l))) &&
    (!q || (a.name + ' ' + a.city + ' ' + a.description).toLowerCase().includes(q)));
  if (state.pos) {
    list.forEach(a => a._d = dist(state.pos, [a.lat, a.lon]));
    if (state.radius) list = list.filter(a => a._d <= state.radius);
    list.sort((a, b) => a._d - b._d);
  } else list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function render() {
  const L = t();
  document.documentElement.lang = state.lang; document.title = L.title;
  $('#title').textContent = L.title;
  document.querySelectorAll('[data-t]').forEach(el => el.textContent = L[el.dataset.t]);
  $('#q').placeholder = L.search;
  chips('#f-cost', 'cost', ['free','paid'], state.cost, v => L[v]);
  chips('#f-kind', 'kind', ['physical','mental'], state.kind, v => L[v]);
  chips('#f-diff', 'diff', ['easy','medium','hard'], state.diff, v => L[v]);
  const present = [...new Set(state.all.map(a => a.sport).filter(Boolean))].sort();
  $('#sport-box').hidden = !present.length;
  chips('#f-sport', 'sport', present, state.sports, v => L.sports[v] || v);
  chips('#f-lang', 'lang', ['de','fr','it','en'], state.langs, v => v.toUpperCase());
  const cs = $('#city'), cur = cs.value;
  cs.innerHTML = `<option value="">${esc(L.pickcity)}</option>` + Object.keys(CITIES).map(c => `<option>${esc(c)}</option>`).join('');
  cs.value = cur;
  $('#radius-out').textContent = state.radius ? `${state.radius} km` : L.any;
  const list = filtered();
  $('#count').textContent = L.results(list.length);
  const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  $('#list').innerHTML = list.slice(0, state.shown).map(a => {
    const fee = a.cost === 'paid' && a.feeMin != null ? `CHF ${a.feeMin === a.feeMax ? fmt(a.feeMin) : fmt(a.feeMin) + '–' + fmt(a.feeMax)}` : '';
    const tags = [`<span class="tag red">${esc(L.cat[a.category] || a.category)}</span>`,
      `<span class="tag">${a.cost === 'unknown' ? esc(L.unknown) : esc(L[a.cost])}${fee ? ' · ' + esc(fee) : ''}</span>`,
      a.feeNote ? `<span class="tag">${esc(a.feeNote)}</span>` : '',
      a.sport ? `<span class="tag">${esc(L.sports[a.sport] || a.sport)}</span>` : '',
      `<span class="tag">${esc(L[a.kind])}</span>`,
      a.difficulty !== 'unknown' ? `<span class="tag">${esc(L[a.difficulty])}</span>` : '',
      ...a.languages.map(l => `<span class="tag">${l.toUpperCase()}</span>`),
      a.minAge != null || a.maxAge != null ? `<span class="tag">${a.minAge ?? 0}–${a.maxAge ?? '∞'} y</span>` : '',
      a._d != null && state.pos ? `<span class="tag">${a._d.toFixed(a._d < 10 ? 1 : 0)} km</span>` : ''].join('');
    const img = a.images?.[0];
    const pic = img ? `<figure class="pic"><img src="${esc(img.url)}" alt="${esc(a.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()">
      <figcaption>${esc(L.photoBy)}: ${esc(img.credit)} · ${esc(img.license)}${img.source ? ` · <a href="${esc(img.source)}" rel="noopener noreferrer" target="_blank">${esc(L.source)}</a>` : ''}</figcaption></figure>` : '';
    const where = [a.address, a.city].filter(Boolean).join(', ');
    return `<article class="card">${pic}<h2>${esc(a.name)}</h2><div class="muted">${esc(where)}</div>
      ${a.description ? `<p>${esc(a.description)}</p>` : ''}<div class="meta">${tags}</div>
      <p class="muted"><a href="https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=16/${a.lat}/${a.lon}" rel="noopener" target="_blank">OSM</a>
      ${a.url ? ` · <a href="${esc(a.url)}" rel="noopener noreferrer" target="_blank">${esc(L.view)}</a>` : ''}</p></article>`;
  }).join('');
  $('#more').hidden = list.length <= state.shown;
  $('#more').textContent = L.more;
  $('#source-note').textContent = L.sourceNote;
}

function setPos(lat, lon) { state.pos = [lat, lon]; state.shown = PAGE; render(); }
function locate(cb) {
  if (!navigator.geolocation) return alert(t().noloc);
  navigator.geolocation.getCurrentPosition(p => cb(p.coords.latitude, p.coords.longitude), () => alert(t().noloc), { timeout: 10000 });
}

const SWISS = { lat: [45.7, 47.9], lon: [5.9, 10.6] };
const inSwiss = (la, lo) => la > SWISS.lat[0] && la < SWISS.lat[1] && lo > SWISS.lon[0] && lo < SWISS.lon[1];

// swisstopo geocoder: free, no key, CORS-enabled. Called only when the person clicks "Find address".
async function geocode(text) {
  const q = new URLSearchParams({ searchText: text, type: 'locations', origins: 'address,zipcode,gg25', limit: '5', sr: '4326' });
  const r = await fetch(`https://api3.geo.admin.ch/rest/services/api/SearchServer?${q}`);
  if (!r.ok) throw new Error('geocoder');
  const j = await r.json();
  return (j.results || []).map(x => ({ label: String(x.attrs.label).replace(/<[^>]*>/g, ''), lat: +x.attrs.lat, lon: +x.attrs.lon })).filter(x => inSwiss(x.lat, x.lon));
}

function initSubmit() {
  const L = t(), dlg = $('#dlg'), f = $('#sform');
  f.querySelector('[name=category]').innerHTML = Object.entries(L.cat).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  f.querySelector('[name=sport]').innerHTML = Object.entries(L.sports).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const sync = () => {
    $('#sport-row').hidden = f.category.value !== 'sport';
    $('#fee-row').hidden = f.cost.value !== 'paid';
    $('#photo-box').hidden = !$('#addPhotos').checked;
    f.photoCredit.required = f.photoRights.required = $('#addPhotos').checked;
  };
  let chosen = null;   // {lat, lon, label} from the geocoder; its coordinates are auto-filled into the form
  const status = m => { $('#geo-status').textContent = m; };
  f.category.onchange = f.cost.onchange = $('#addPhotos').onchange = sync; sync();
  $('#add').onclick = () => { f.reset(); chosen = null; status(''); $('#geo-matches').hidden = true; sync(); initSubmitLabels(); dlg.showModal(); };
  $('#cancel').onclick = () => dlg.close();
  $('#here').onclick = () => locate((la, lo) => { f.coords.value = `${la.toFixed(5)}, ${lo.toFixed(5)}`; f.coords.closest('details').open = true; });

  const choose = m => { chosen = m; f.coords.value = `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`; status(`${t().found}: ${m.label}`); };
  $('#find').onclick = async () => {
    const q = [f.address.value, f.city.value].filter(Boolean).join(', ').trim();
    if (!q) return f.address.focus();
    status('…'); $('#geo-matches').hidden = true;
    try {
      const res = await geocode(q);
      if (!res.length) { chosen = null; return status(t().notFound); }
      if (res.length === 1) return choose(res[0]);
      const sel = $('#geo-matches'); sel.hidden = false;
      sel.innerHTML = `<option value="">${esc(t().pickMatch)}</option>` + res.map((m, i) => `<option value="${i}">${esc(m.label)}</option>`).join('');
      sel.onchange = () => sel.value !== '' && choose(res[+sel.value]);
      status(`${res.length} ${t().found.toLowerCase()}`);
    } catch { status(t().notFound); }
  };
  // Editing the address invalidates coordinates that came from an earlier lookup (never submit a stale location).
  f.address.oninput = f.city.oninput = () => { if (chosen) { f.coords.value = ''; chosen = null; status(''); } };
  f.coords.oninput = () => f.coords.setCustomValidity('');

  f.onsubmit = e => {
    e.preventDefault();
    const d = new FormData(f);
    const raw = String(d.get('coords')).trim();
    let lat, lon;
    if (raw) { [lat, lon] = raw.split(',').map(s => parseFloat(s)); if (!inSwiss(lat, lon)) { f.coords.setCustomValidity('Swiss coordinates'); f.coords.closest('details').open = true; f.coords.reportValidity(); return; } }
    const address = String(d.get('address')).trim();
    if (!raw && !address) { f.address.setCustomValidity(' '); f.address.reportValidity(); f.address.setCustomValidity(''); return; }
    const num = k => (d.get(k) === '' ? undefined : +d.get(k));
    const paid = d.get('cost') === 'paid';
    const payload = { name: d.get('name'), description: d.get('description'), category: d.get('category'), cost: d.get('cost'),
      kind: d.get('kind'), difficulty: d.get('difficulty'), city: d.get('city'), address, lat, lon, url: d.get('url'),
      sport: d.get('category') === 'sport' ? d.get('sport') : undefined,
      feeMin: paid ? num('feeMin') : undefined, feeMax: paid ? num('feeMax') : undefined, feeNote: paid ? d.get('feeNote') : undefined,
      languages: d.getAll('languages'), minAge: num('minAge'), maxAge: num('maxAge'),
      photo: $('#addPhotos').checked ? { credit: d.get('photoCredit'), license: d.get('photoLicense'), rights: d.get('photoRights') === 'on' } : undefined };
    let body = 'Please review this activity suggestion. A maintainer adds the `approved` label to publish it.\n\n```json\n' + JSON.stringify(payload, null, 2) + '\n```\n';
    if (payload.photo) body += '\n---\n**Photos:** drag up to 3 JPG/PNG files (max 2 MB each) into this description, below this line. No identifiable people or children.\n\n';
    window.open(`https://github.com/${REPO}/issues/new?labels=submission&title=${encodeURIComponent('Activity: ' + payload.name)}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
    dlg.close();
  };
}
function initSubmitLabels() {
  const L = t();
  document.querySelectorAll('#dlg [data-t]').forEach(el => { if (L[el.dataset.t]) el.textContent = L[el.dataset.t]; });
  $('#submitNote').textContent = L.submitNote;
}

async function init() {
  const sel = $('#ui-lang'); sel.value = state.lang;
  sel.onchange = () => { state.lang = sel.value; try { localStorage.setItem('lang', state.lang); } catch {} render(); initSubmit(); };
  $('#q').oninput = e => { state.q = e.target.value; state.shown = PAGE; render(); };
  $('#city').onchange = e => { const c = CITIES[e.target.value]; if (c) setPos(...c); };
  $('#myloc').onclick = () => locate((la, lo) => { $('#city').value = ''; setPos(la, lo); });
  $('#radius').oninput = e => { state.radius = +e.target.value; state.shown = PAGE; render(); };
  $('#more').onclick = () => { state.shown += PAGE; render(); };
  try {
    const r = await fetch('data/activities.json'); state.all = (await r.json()).activities;
  } catch { $('#list').textContent = 'Could not load data.'; }
  render(); initSubmit();
}
init();
