/* Orbrant v1
 * Part 1: pure calculation functions (no page access, easy to test and reuse).
 * Part 2: page wiring (only runs in a browser).
 */

// Supabase settings. The publishable key (sb_publishable_...) is designed to be visible in the browser.
// NEVER put a secret key (sb_secret_...) or service_role key here.
const FF_CONFIG = {
  SUPABASE_URL: 'https://uiydxoajlzxmxuewkezi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_QEzWH4F1CVBnsFnFrUf0Mw_3Gnt5S9r'
};
const FF_BUILD = 'build 5';

/* ---------- Part 1: calculations ---------- */

const DEFAULTS = {
  spoolPrice: 25, spoolWeight: 1000, usedGrams: 50, wastePct: 5,
  watts: 200, hours: 4, kwhPrice: 0.30,
  maintenance: 0.5, packaging: 1, otherCost: 0,
  markup: 100,
  currency: 'NZD'
};

// positive: true means the value must be greater than 0 (it is used as a divisor).
const RULES = {
  spoolPrice:  { label: 'Spool price' },
  spoolWeight: { label: 'Spool weight', positive: true },
  usedGrams:   { label: 'Filament used' },
  wastePct:    { label: 'Waste allowance' },
  watts:       { label: 'Printer power' },
  hours:       { label: 'Print time' },
  kwhPrice:    { label: 'Electricity price' },
  maintenance: { label: 'Maintenance' },
  packaging:   { label: 'Packaging' },
  otherCost:   { label: 'Other expenses' },
  markup:      { label: 'Markup' }
};
const MAX_VALUE = 1e7;

// Turns raw text into a finite number, or NaN. Blank is NOT treated as 0.
function toNumber(raw) {
  if (raw === null || raw === undefined) return NaN;
  const text = String(raw).trim();
  if (text === '') return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

// Returns { fieldId: "message" } for every invalid field. Empty object = all valid.
function validate(raw) {
  const errors = {};
  Object.keys(RULES).forEach(function (id) {
    const n = toNumber(raw[id]);
    if (Number.isNaN(n)) errors[id] = 'Enter a number (0 is fine for optional costs).';
    else if (n < 0) errors[id] = 'Cannot be negative.';
    else if (RULES[id].positive && n === 0) errors[id] = 'Must be greater than 0.';
    else if (n > MAX_VALUE) errors[id] = 'That value is too large.';
  });
  return errors;
}

// Takes numbers (already validated). Returns the full cost breakdown.
// Values that cannot be calculated safely (for example cost per hour with 0 hours) are null.
function calculate(v) {
  const costPerGram = v.spoolPrice / v.spoolWeight;
  const filament = costPerGram * v.usedGrams;
  const waste = filament * (v.wastePct / 100);
  const electricity = (v.watts / 1000) * v.hours * v.kwhPrice;
  const other = v.maintenance + v.packaging + v.otherCost;
  const total = filament + waste + electricity + other;
  const sellingPrice = total * (1 + v.markup / 100);
  const profit = sellingPrice - total;
  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : null;
  const costPerHour = v.hours > 0 ? total / v.hours : null;
  return { costPerGram, filament, waste, electricity, other, total, sellingPrice, profit, margin, costPerHour };
}

// Converts a markup % into the margin % it produces, e.g. 100 -> 50.
function marginFromMarkup(markup) {
  return (markup / (100 + markup)) * 100;
}

if (typeof module !== 'undefined') {
  module.exports = { DEFAULTS, RULES, toNumber, validate, calculate, marginFromMarkup };
}

/* ---------- Part 2: page wiring ---------- */

if (typeof document !== 'undefined') {
  (function () {
    const STORAGE_KEY = 'orbrant.v1';
    const OLD_STORAGE_KEY = 'filamentflow.v1'; // from before the Orbrant rebrand; migrated once
    const NUMBER_IDS = Object.keys(RULES);
    const $ = function (id) { return document.getElementById(id); };
    let currency = DEFAULTS.currency;

    function formatMoney(n, decimals) {
      if (n === null || !Number.isFinite(n)) return '–';
      const d = decimals === undefined ? 2 : decimals;
      try {
        return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
      } catch (e) {
        return n.toFixed(d) + ' ' + currency;
      }
    }
    function formatPercent(n) {
      return n === null || !Number.isFinite(n) ? '–' : n.toFixed(1) + '%';
    }

    function readRaw() {
      const raw = {};
      NUMBER_IDS.forEach(function (id) { raw[id] = $(id).value; });
      return raw;
    }

    function showErrors(errors) {
      NUMBER_IDS.forEach(function (id) {
        const input = $(id);
        const msg = errors[id] || '';
        $('err-' + id).textContent = msg;
        input.setAttribute('aria-invalid', msg ? 'true' : 'false');
        input.setAttribute('aria-describedby', 'err-' + id);
        input.closest('.field').classList.toggle('invalid', Boolean(msg));
      });
    }

    function setText(id, text) { $(id).textContent = text; }

    function showSplit(r) {
      const parts = [[r.filament, 's1'], [r.waste, 's2'], [r.electricity, 's3'], [r.other, 's4']];
      const bar = $('split');
      bar.innerHTML = '';
      if (!r || r.total <= 0) return;
      parts.forEach(function (p) {
        const seg = document.createElement('span');
        seg.className = p[1];
        seg.style.width = (p[0] / r.total * 100) + '%';
        bar.appendChild(seg);
      });
    }

    function clearResults() {
      ['rFilament', 'rWaste', 'rElec', 'rOther', 'rTotal', 'rPrice', 'rProfit', 'rMargin', 'rCpg', 'rCph'].forEach(function (id) { setText(id, '–'); });
      $('split').innerHTML = '';
      setText('rNote', '');
    }

    function showResults(r, markup) {
      setText('rFilament', formatMoney(r.filament));
      setText('rWaste', formatMoney(r.waste));
      setText('rElec', formatMoney(r.electricity));
      setText('rOther', formatMoney(r.other));
      setText('rTotal', formatMoney(r.total));
      setText('rPrice', formatMoney(r.sellingPrice));
      setText('rProfit', formatMoney(r.profit));
      setText('rMargin', formatPercent(r.margin));
      setText('rCpg', formatMoney(r.costPerGram, 4) + ' / g');
      setText('rCph', r.costPerHour === null ? 'n/a (print time is 0)' : formatMoney(r.costPerHour) + ' / h');
      setText('rNote', 'A ' + markup + '% markup gives a ' + formatPercent(marginFromMarkup(markup)) + ' profit margin. Gross profit does not include your time, tax, fees or other overheads.');
      showSplit(r);
    }

    function update() {
      const raw = readRaw();
      const errors = validate(raw);
      showErrors(errors);
      const hasErrors = Object.keys(errors).length > 0;
      $('invalidMsg').hidden = !hasErrors;
      if (hasErrors) { clearResults(); } else {
        const values = {};
        NUMBER_IDS.forEach(function (id) { values[id] = toNumber(raw[id]); });
        showResults(calculate(values), values.markup);
      }
      save(raw);
    }

    function setCurrencyLabels() {
      document.querySelectorAll('.cur').forEach(function (el) { el.textContent = currency; });
    }

    function fillForm(data) {
      NUMBER_IDS.forEach(function (id) { $(id).value = data[id]; });
      currency = data.currency;
      $('currency').value = currency;
      setCurrencyLabels();
    }

    // localStorage can be blocked (private mode, file restrictions), so every use is wrapped.
    function save(raw) {
      try {
        const data = Object.assign({}, raw, { currency: currency });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) { /* saving is optional */ }
    }
    function load() {
      try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null && localStorage.getItem(OLD_STORAGE_KEY) !== null) {
          raw = localStorage.getItem(OLD_STORAGE_KEY);
          localStorage.setItem(STORAGE_KEY, raw);
          localStorage.removeItem(OLD_STORAGE_KEY);
        }
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') return Object.assign({}, DEFAULTS, saved);
      } catch (e) { /* fall back to defaults */ }
      return Object.assign({}, DEFAULTS);
    }
    function reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      fillForm(DEFAULTS);
      update();
      $('saveNote').textContent = 'Reset to defaults and cleared saved inputs.';
    }

    window.FFCalcReset = reset; // used by the Settings page

    // Start-up
    fillForm(load());
    $('form').addEventListener('input', update);
    $('form').addEventListener('submit', function (e) { e.preventDefault(); });
    $('currency').addEventListener('change', function () {
      currency = $('currency').value;
      setCurrencyLabels();
      update();
    });
    $('resetBtn').addEventListener('click', reset);

    const menuBtn = $('menuBtn');
    const nav = $('nav');
    menuBtn.addEventListener('click', function () {
      const open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
    });

    update();
  })();
}

/* ---------- Part 3: Model Library (live data from Supabase) ---------- */
if (typeof document !== 'undefined') (function () {
  // Limits are shown to users and enforced again by the database/Storage rules (see supabase-migration.sql).
  const LIMITS = { modelBytes: 50 * 1024 * 1024, imageBytes: 5 * 1024 * 1024, maxTags: 8, pageSize: 12 };
  const MODEL_EXT = ['stl', '3mf', 'obj', 'step', 'stp'];
  const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const CATEGORIES = ['Home & Desk', 'Mechanical', 'Decor', 'Games', 'Tools', 'Toys', 'Other'];
  const COLS = 'id,creator_id,title,description,category,tags,file_name,file_type,file_size,thumbnail_path,listing_type,price,status,created_at,profiles(username)';
  const $ = (id) => document.getElementById(id);
  const sb = () => (window.FFAuth ? window.FFAuth.client() : null);
  const state = { q: '', cat: 'all', sort: 'newest', creator: null, page: 0, total: 0, loading: false, items: [] };
  let uploading = false, timer = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const money = (n) => 'NZ$' + Number(n).toFixed(2);
  const sizeLabel = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const creatorName = (m) => (m.profiles && m.profiles.username ? '@' + m.profiles.username : 'Unnamed creator');
  const priceLabel = (m) => (m.listing_type === 'premium' ? 'Premium · ' + money(m.price) : 'Free');
  function say(id, text, kind) { const m = $(id); m.textContent = text || ''; m.hidden = !text; m.className = 'msg ' + (kind || ''); }
  function thumbUrl(path) { const c = sb(); return c && path ? c.storage.from('model-previews').getPublicUrl(path).data.publicUrl : null; }
  function thumbBox(path, alt) {
    const box = el('div', 'thumb');
    const url = thumbUrl(path);
    if (!url) { box.textContent = 'No preview image'; return box; }
    const img = el('img'); img.src = url; img.alt = alt; img.loading = 'lazy';
    img.addEventListener('error', function () { box.textContent = 'Preview unavailable'; });
    box.appendChild(img);
    return box;
  }

  // ----- browsing -----
  async function fetchPage(reset) {
    const c = sb();
    if (!c) { say('libError', 'The library needs the Supabase connection, which is not available. See the notice on the Sign in page.', 'err'); $('retryBtn').hidden = true; return; }
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.page = 0; state.items = []; }
    $('count').textContent = 'Loading models…';
    say('libError', '');
    $('retryBtn').hidden = true;
    let q = c.from('models').select(COLS, { count: 'exact' }).eq('status', 'published');
    if (state.cat !== 'all') q = q.eq('category', state.cat);
    if (state.creator) q = q.eq('creator_id', state.creator);
    const term = state.q.replace(/[%,()*{}"\\]/g, ' ').trim();
    if (term) q = q.or('title.ilike.%' + term + '%,description.ilike.%' + term + '%,tags.cs.{' + term.toLowerCase().replace(/\s+/g, '-') + '}');
    if (state.sort === 'oldest') q = q.order('created_at', { ascending: true });
    else if (state.sort === 'title') q = q.order('title', { ascending: true });
    else if (state.sort === 'free') q = q.order('listing_type', { ascending: true }).order('created_at', { ascending: false });
    else if (state.sort === 'premium') q = q.order('listing_type', { ascending: false }).order('created_at', { ascending: false });
    else q = q.order('created_at', { ascending: false });
    const from = state.page * LIMITS.pageSize;
    const res = await q.range(from, from + LIMITS.pageSize - 1);
    state.loading = false;
    if (res.error) { say('libError', 'Could not load models: ' + res.error.message, 'err'); $('retryBtn').hidden = false; $('count').textContent = ''; return; }
    state.items = state.items.concat(res.data || []);
    state.total = res.count || 0;
    state.page++;
    renderList();
  }
  function renderList() {
    const grid = $('grid');
    grid.innerHTML = '';
    state.items.forEach(function (m) {
      const a = el('a', 'model-card');
      a.href = '#/library/' + m.id;
      a.appendChild(thumbBox(m.thumbnail_path, m.title));
      const body = el('div', 'body');
      body.appendChild(el('h3', '', m.title));
      body.appendChild(el('p', 'meta', creatorName(m) + ' · ' + priceLabel(m)));
      if (m.description) body.appendChild(el('p', 'meta clamp', m.description));
      const tags = el('div', 'tags');
      tags.appendChild(el('span', 'tag', m.category));
      (m.tags || []).slice(0, 3).forEach(function (t) { tags.appendChild(el('span', 'tag', t)); });
      body.appendChild(tags);
      a.appendChild(body);
      grid.appendChild(a);
    });
    $('count').textContent = state.total + (state.total === 1 ? ' model' : ' models') + (state.creator ? ' by this creator' : '');
    const filtered = state.q.trim() || state.cat !== 'all' || state.creator;
    $('empty').hidden = state.items.length > 0;
    $('empty').textContent = filtered ? 'No models match your search. Try a different word or category.' : 'No models have been published yet. Be the first: upload one.';
    $('moreBtn').hidden = state.items.length >= state.total;
  }

  // ----- detail and download -----
  async function loadDetail(id) {
    const v = $('detailView');
    v.innerHTML = '';
    v.appendChild(el('p', 'note', 'Loading…'));
    const c = sb();
    if (!c) { v.innerHTML = ''; v.appendChild(el('p', 'msg err', 'The library is not connected to Supabase.')); return; }
    const res = await c.from('models').select(COLS + ',file_path').eq('id', id).maybeSingle();
    v.innerHTML = '';
    const back = el('a', 'back', '← All models'); back.href = '#/library'; v.appendChild(back);
    if (res.error || !res.data) { v.appendChild(el('p', 'empty', res.error ? 'Could not load this model: ' + res.error.message : 'This model was not found, or is not published.')); return; }
    const m = res.data;
    v.appendChild(el('h2', '', m.title));
    const wrap = el('div', 'detail');
    wrap.appendChild(thumbBox(m.thumbnail_path, m.title));
    const side = el('div'), dl = el('dl');
    const by = el('a', '', creatorName(m)); by.href = '#/library/by/' + m.creator_id;
    const rows = [['Creator', by], ['Price', priceLabel(m)], ['Category', m.category], ['File', m.file_type.toUpperCase() + ' · ' + sizeLabel(m.file_size)],
      ['Tags', (m.tags || []).join(', ') || 'None'], ['Description', m.description || 'No description.']];
    rows.forEach(function (r) { dl.appendChild(el('dt', '', r[0])); const dd = el('dd'); if (typeof r[1] === 'string') dd.textContent = r[1]; else dd.appendChild(r[1]); dl.appendChild(dd); });
    side.appendChild(dl);
    if (m.status !== 'published') side.appendChild(el('p', 'note-box', 'Only you can see this listing. Status: ' + m.status + '.'));
    if (m.listing_type === 'free' && m.status === 'published') {
      const b = el('button', 'btn primary', 'Download'); b.type = 'button';
      b.addEventListener('click', function () { download(m, b); });
      side.appendChild(b);
    } else if (m.listing_type === 'premium') {
      const b = el('button', 'btn primary', 'Purchase (payments not set up)'); b.disabled = true; side.appendChild(b);
      side.appendChild(el('p', 'note-box', 'Premium purchases are not available yet. No payment can be made and this file cannot be downloaded.'));
    }
    const dlMsg = el('p', 'msg', ''); dlMsg.id = 'dlMsg'; dlMsg.hidden = true; side.appendChild(dlMsg);
    wrap.appendChild(side);
    v.appendChild(wrap);
  }
  async function download(m, btn) {
    btn.disabled = true;
    say('dlMsg', 'Preparing your download…');
    const res = await sb().storage.from('model-files').createSignedUrl(m.file_path, 60, { download: m.file_name });
    btn.disabled = false;
    if (res.error || !res.data) { say('dlMsg', 'This file is not available for download right now. ' + (res.error ? res.error.message : ''), 'err'); return; }
    const a = document.createElement('a');
    a.href = res.data.signedUrl; a.download = m.file_name;
    document.body.appendChild(a); a.click(); a.remove();
    say('dlMsg', 'Download started.', 'ok');
  }

  // ----- upload -----
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function checkUpload(f) {
    if (f.title.length < 3 || f.title.length > 100) return 'Title must be 3–100 characters.';
    if (f.desc.length > 2000) return 'Description must be 2000 characters or fewer.';
    if (!f.cat) return 'Choose a category.';
    if (f.tags.length > LIMITS.maxTags) return 'Use at most ' + LIMITS.maxTags + ' tags.';
    if (f.tags.some(function (t) { return !/^[a-z0-9-]{1,30}$/.test(t); })) return 'Tags can only use letters, numbers and hyphens (30 characters max each).';
    if (!f.file) return 'Choose a model file.';
    if (MODEL_EXT.indexOf(f.ext) < 0) return 'Model files must be STL, 3MF, OBJ or STEP.';
    if (f.file.size <= 0) return 'The model file is empty.';
    if (f.file.size > LIMITS.modelBytes) return 'The model file is over ' + sizeLabel(LIMITS.modelBytes) + '.';
    if (f.img && !IMAGE_EXT[f.img.type]) return 'The preview image must be PNG, JPG or WebP.';
    if (f.img && f.img.size > LIMITS.imageBytes) return 'The preview image is over ' + sizeLabel(LIMITS.imageBytes) + '.';
    if (f.type === 'premium' && !(f.price > 0 && f.price <= 10000)) return 'Enter a price between 0.01 and 10000.';
    return '';
  }
  async function onUpload(e) {
    e.preventDefault();
    if (uploading) return;
    const c = sb(), user = window.FFAuth && window.FFAuth.user();
    if (!c || !user) { say('upMsg', 'Please sign in to upload models.', 'err'); return; }
    const file = $('upFile').files[0], img = $('upThumb').files[0], type = $('upType').value;
    const f = { title: $('upTitle').value.trim(), desc: $('upDesc').value.trim(), cat: $('upCat').value, type: type,
      tags: Array.from(new Set($('upTags').value.split(',').map(function (t) { return t.trim().toLowerCase().replace(/\s+/g, '-'); }).filter(Boolean))),
      file: file, img: img, ext: file ? file.name.split('.').pop().toLowerCase() : '', price: type === 'premium' ? Math.round(Number($('upPrice').value) * 100) / 100 : null };
    const problem = checkUpload(f);
    if (problem) { say('upMsg', problem, 'err'); return; }
    uploading = true; $('upBtn').disabled = true; say('upMsg', '');
    const id = uuid(), base = user.id + '/' + id + '/', uploaded = [];
    const filePath = base + f.file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100);
    const thumbPath = img ? base + 'thumbnail.' + IMAGE_EXT[img.type] : null;
    try {
      say('upMsg', 'Uploading model file… (stage 1 of ' + (img ? 3 : 2) + ')');
      let r = await c.storage.from('model-files').upload(filePath, f.file, { contentType: 'application/octet-stream', upsert: false });
      if (r.error) throw r.error;
      uploaded.push(['model-files', filePath]);
      if (img) {
        say('upMsg', 'Uploading preview image… (stage 2 of 3)');
        r = await c.storage.from('model-previews').upload(thumbPath, img, { contentType: img.type, upsert: false });
        if (r.error) throw r.error;
        uploaded.push(['model-previews', thumbPath]);
      }
      say('upMsg', 'Saving your listing… (final stage)');
      const ins = await c.from('models').insert({ id: id, creator_id: user.id, title: f.title, description: f.desc, category: f.cat, tags: f.tags,
        file_path: filePath, file_name: f.file.name, file_type: f.ext, file_size: f.file.size, thumbnail_path: thumbPath, listing_type: type, price: f.price, status: 'pending' });
      if (ins.error) throw ins.error;
      $('formUpload').reset(); $('upPriceField').hidden = true;
      say('upMsg', 'Upload complete. Your model is pending review and will appear in the library once approved. You can track it in your Creator dashboard.', 'ok');
    } catch (err) {
      for (let i = 0; i < uploaded.length; i++) { try { await c.storage.from(uploaded[i][0]).remove([uploaded[i][1]]); } catch (x) { /* best effort */ } }
      say('upMsg', 'Upload failed, and nothing was saved: ' + (err && err.message ? err.message : 'unknown error'), 'err');
    } finally { uploading = false; $('upBtn').disabled = false; }
  }

  // ----- creator dashboard -----
  async function loadMine() {
    const c = sb(), user = window.FFAuth && window.FFAuth.user(), host = $('myListings');
    if (!c || !user) return;
    host.textContent = 'Loading your listings…';
    const res = await c.from('models').select('id,title,status,listing_type,price,created_at').eq('creator_id', user.id).order('created_at', { ascending: false });
    host.innerHTML = '';
    if (res.error) { host.appendChild(el('p', 'msg err', 'Could not load your listings: ' + res.error.message)); return; }
    if (!res.data.length) { host.appendChild(el('p', 'empty', 'You haven’t uploaded any models yet.')); return; }
    res.data.forEach(function (m) {
      const row = el('div', 'listing-row');
      const a = el('a', '', m.title); a.href = '#/library/' + m.id;
      row.appendChild(a);
      row.appendChild(el('span', 'tag st-' + m.status, m.status));
      const del = el('button', 'btn', 'Delete'); del.type = 'button';
      del.addEventListener('click', function () { deleteMine(m.id, del); });
      row.appendChild(del);
      host.appendChild(row);
    });
  }
  async function deleteMine(id, btn) {
    if (!window.confirm('Delete this listing and its files? This cannot be undone.')) return;
    const c = sb();
    btn.disabled = true;
    const sel = await c.from('models').select('file_path,thumbnail_path').eq('id', id).single();
    const del = await c.from('models').delete().eq('id', id);
    if (del.error) { say('dashMsg', 'Could not delete: ' + del.error.message, 'err'); btn.disabled = false; return; }
    if (sel.data) {
      const rm1 = await c.storage.from('model-files').remove([sel.data.file_path]);
      const rm2 = sel.data.thumbnail_path ? await c.storage.from('model-previews').remove([sel.data.thumbnail_path]) : { error: null };
      if (rm1.error || rm2.error) say('dashMsg', 'Listing deleted, but some files could not be removed.', 'err'); else say('dashMsg', 'Listing deleted.', 'ok');
    }
    loadMine();
  }

  function show(parts) {
    const second = parts[1] || null;
    if (second && second !== 'by') { $('listView').hidden = true; $('detailView').hidden = false; loadDetail(second); return; }
    $('listView').hidden = false; $('detailView').hidden = true;
    state.creator = second === 'by' ? (parts[2] || null) : null;
    fetchPage(true);
  }

  // ----- setup -----
  CATEGORIES.forEach(function (c) {
    [$('cat'), $('upCat')].forEach(function (sel, i) { const o = el('option', '', c); o.value = c; sel.appendChild(o); });
  });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; clearTimeout(timer); timer = setTimeout(function () { fetchPage(true); }, 300); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; fetchPage(true); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; fetchPage(true); });
  $('moreBtn').addEventListener('click', function () { fetchPage(false); });
  $('retryBtn').addEventListener('click', function () { fetchPage(true); });
  $('upType').addEventListener('change', function (e) { $('upPriceField').hidden = e.target.value !== 'premium'; });
  $('formUpload').addEventListener('submit', onUpload);
  window.FFLibrary = { show: show, loadMine: loadMine, limits: LIMITS };
})();

/* ---------- Part 5: accounts (Supabase Auth) ----------
 * Uses the official Supabase client (loaded in index.html). Passwords are handled by Supabase, never by this code.
 * Sessions persist in the browser via the Supabase client. Security is enforced by Row Level Security in the
 * database (see README.md); hiding buttons here is only a convenience. */
if (typeof document !== 'undefined') (function () {
  const $ = (id) => document.getElementById(id);
  // One client only, created once. Whitespace is trimmed because a stray space or line break in a pasted key causes "Invalid API key".
  const url = String(FF_CONFIG.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(FF_CONFIG.SUPABASE_ANON_KEY || '').trim();
  const secretKey = key.indexOf('sb_secret_') === 0;
  const sb = (url && key && !secretKey && window.supabase)
    ? window.supabase.createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;
  let keyNote = secretKey ? 'This is a SECRET key. Never use it in a website. Use the Publishable key instead, and rotate the secret key in Supabase now.' : '';
  console.info('Orbrant ' + FF_BUILD + ' | Supabase URL: ' + url + ' | key starts: ' + key.slice(0, 16) + '… (' + key.length + ' chars) | library loaded: ' + Boolean(window.supabase));
  // Independent check that does not use the Supabase library: asks Supabase's auth server for its settings using only this key.
  if (sb) fetch(url + '/auth/v1/settings', { headers: { apikey: key } }).then(function (r) {
    console.info('Orbrant key check: HTTP ' + r.status);
    if (r.status === 401 || r.status === 403) keyNote = 'Supabase rejected the public key in script.js (HTTP ' + r.status + '). Copy the Publishable key again from Project Settings → API Keys for project uiydxoajlzxmxuewkezi, with no spaces, and re-upload script.js.';
    updateBanner();
  }).catch(function () { console.info('Orbrant key check: could not reach Supabase'); });
  let user = null, profile = null, ready = !sb, returnTo = '#/', pendingMsg = '', pendingEmail = '';
  const redirectUrl = () => location.origin + location.pathname;

  function say(id, text, kind) {
    const m = $(id);
    m.textContent = text || '';
    m.hidden = !text;
    m.className = 'msg ' + (kind || '');
  }
  function friendly(err) {
    const msg = ((err && err.message) || '').toLowerCase(), code = err && err.code;
    if (msg.includes('invalid api key')) return 'Supabase rejected this site’s public key (Invalid API key). See the notice at the top of this page and the troubleshooting section in README.md.';
    if (msg.includes('invalid login')) return 'Email or password is incorrect.';
    if (msg.includes('not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
    if (code === 'weak_password' || msg.includes('password should')) return 'That password is too weak. Use at least 8 characters with letters and numbers.';
    if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) return 'Too many requests. Please wait a few minutes and try again.';
    if (msg.includes('failed to fetch')) return 'Could not reach the server. Check your connection and the project URL in script.js.';
    return 'Something went wrong: ' + ((err && err.message) || 'unknown error');
  }
  function passwordProblem(pw, pw2) {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password needs at least one letter and one number.';
    if (pw !== pw2) return 'The two passwords do not match.';
    return '';
  }
  const busy = (form, on) => { form.querySelector('button[type=submit]').disabled = on || !sb; };

  function renderAcct() {
    document.body.dataset.auth = user ? 'in' : 'out';
    if (!user) return;
    $('acctName').textContent = (profile && profile.username) || (user.email || 'Account').split('@')[0];
    $('acctEmail').textContent = 'Signed in as ' + user.email;
    $('setEmail').textContent = 'Signed in as ' + user.email;
  }
  function fillProfile() {
    $('username').value = (profile && profile.username) || '';
    $('bio').value = (profile && profile.bio) || '';
    const url = profile && profile.avatar_url;
    const ok = typeof url === 'string' && url.indexOf('https://') === 0;
    $('avatarImg').hidden = !ok;
    $('avatarPh').hidden = ok;
    if (ok) $('avatarImg').src = url;
  }
  async function loadProfile() {
    if (!sb || !user) return;
    const res = await sb.from('profiles').select('username,bio,avatar_url').eq('id', user.id).maybeSingle();
    if (res.error) { say('profMsg', 'Could not load your profile: ' + res.error.message, 'err'); return; }
    profile = res.data || {};
    fillProfile();
    renderAcct();
  }

  // --- forms ---
  $('formSignin').addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = $('siEmail').value.trim(), pw = $('siPass').value;
    if (!email || !pw) { say('authMsg', 'Enter your email and password.', 'err'); return; }
    busy(e.target, true);
    const res = await sb.auth.signInWithPassword({ email: email, password: pw });
    busy(e.target, false);
    if (res.error) { say('authMsg', friendly(res.error), 'err'); return; }
    $('siPass').value = '';
    say('authMsg', '');
    location.hash = returnTo;
  });
  $('formRegister').addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = $('rgEmail').value.trim(), pw = $('rgPass').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { say('authMsg', 'Enter a valid email address.', 'err'); return; }
    const problem = passwordProblem(pw, $('rgPass2').value);
    if (problem) { say('authMsg', problem, 'err'); return; }
    busy(e.target, true);
    const res = await sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: redirectUrl() } });
    busy(e.target, false);
    if (res.error) { say('authMsg', friendly(res.error), 'err'); return; }
    if (res.data.user && res.data.user.identities && res.data.user.identities.length === 0) {
      say('authMsg', 'An account with this email already exists. Try signing in, or reset your password.', 'err'); return;
    }
    $('rgPass').value = ''; $('rgPass2').value = '';
    if (res.data.session) { location.hash = returnTo; return; }
    pendingEmail = email;
    say('authMsg', '');
    location.hash = '#/auth/checkemail';
  });
  $('resendBtn').addEventListener('click', async function () {
    if (!sb || !pendingEmail) return;
    const btn = $('resendBtn');
    btn.disabled = true;
    const res = await sb.auth.resend({ type: 'signup', email: pendingEmail, options: { emailRedirectTo: redirectUrl() } });
    btn.disabled = false;
    if (res.error) { say('authMsg', friendly(res.error), 'err'); return; }
    say('authMsg', 'Another confirmation email is on its way.', 'ok');
  });
  $('formForgot').addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = $('fpEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { say('authMsg', 'Enter a valid email address.', 'err'); return; }
    busy(e.target, true);
    const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    busy(e.target, false);
    if (res.error) { say('authMsg', friendly(res.error), 'err'); return; }
    say('authMsg', 'If an account exists for that email, a reset link is on its way. Open it in this same browser.', 'ok');
  });
  $('formReset').addEventListener('submit', async function (e) {
    e.preventDefault();
    const problem = passwordProblem($('rsPass').value, $('rsPass2').value);
    if (problem) { say('authMsg', problem, 'err'); return; }
    if (!user) { say('authMsg', 'Open the reset link from your email first, in this same browser.', 'err'); return; }
    busy(e.target, true);
    const res = await sb.auth.updateUser({ password: $('rsPass').value });
    busy(e.target, false);
    if (res.error) { say('authMsg', friendly(res.error), 'err'); return; }
    $('rsPass').value = ''; $('rsPass2').value = '';
    returnTo = '#/account';
    location.hash = '#/account';
    say('profMsg', 'Password updated.', 'ok');
  });
  $('signOutBtn').addEventListener('click', async function () {
    if (sb) await sb.auth.signOut();
    user = null; profile = null;
    renderAcct();
    location.hash = '#/';
  });
  $('formProfile').addEventListener('submit', async function (e) {
    e.preventDefault();
    const username = $('username').value.trim().toLowerCase(), bio = $('bio').value.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) { say('profMsg', 'Username must be 3–20 characters: letters, numbers or underscore.', 'err'); return; }
    busy(e.target, true);
    const res = await sb.from('profiles').upsert({ id: user.id, username: username, bio: bio });
    busy(e.target, false);
    if (res.error) { say('profMsg', res.error.code === '23505' ? 'That username is already taken.' : 'Could not save: ' + res.error.message, 'err'); return; }
    profile = Object.assign({}, profile, { username: username, bio: bio });
    renderAcct();
    say('profMsg', 'Profile saved.', 'ok');
  });
  $('avatarFile').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (['image/png', 'image/jpeg', 'image/webp'].indexOf(file.type) < 0) { say('profMsg', 'Please choose a PNG, JPG or WebP image.', 'err'); return; }
    if (file.size > 2 * 1024 * 1024) { say('profMsg', 'That image is over 2 MB. Choose a smaller one.', 'err'); return; }
    const path = user.id + '/avatar';
    const up = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) { say('profMsg', 'Upload failed: ' + up.error.message, 'err'); return; }
    const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
    const res = await sb.from('profiles').upsert({ id: user.id, avatar_url: url });
    if (res.error) { say('profMsg', 'Could not save the picture: ' + res.error.message, 'err'); return; }
    profile = Object.assign({}, profile, { avatar_url: url });
    fillProfile();
    say('profMsg', 'Profile picture updated.', 'ok');
  });

  // --- called by the page switcher ---
  const TITLES = { checkemail: 'Check your inbox', signin: 'Sign in', register: 'Create account', forgot: 'Reset your password', reset: 'Choose a new password' };
  function updateBanner() {
    const banner = $('authBanner');
    if (!banner) return;
    banner.hidden = false;
    if (keyNote) banner.textContent = keyNote;
    else if (!url || !key) banner.textContent = 'Accounts are not connected yet. Add your Supabase project URL and public key to FF_CONFIG at the top of script.js (see README.md).';
    else if (!window.supabase) banner.textContent = 'The Supabase library did not load (check your internet connection or an ad blocker), so accounts cannot work.';
    else if (location.protocol === 'file:') banner.textContent = 'You opened this as a local file. Sign-in may work, but email links (confirm, reset) need the published site or a local web server (see README.md).';
    else banner.hidden = true;
  }
  function guard(view) {
    if ((view === 'account' || view === 'dashboard' || view === 'upload') && ready && !user) {
      pendingMsg = 'Sign in to continue.';
      location.hash = '#/auth/signin';
      return false;
    }
    return true;
  }
  function show(view, parts) {
    if (view === 'auth') {
      const sub = TITLES[parts[1]] ? parts[1] : 'signin';
      if (sub === 'checkemail' && !pendingEmail) { location.hash = '#/auth/register'; return; }
      document.querySelectorAll('[data-form]').forEach(function (f) { f.hidden = f.dataset.form !== sub; });
      $('doneEmail').textContent = pendingEmail;
      $('authTitle').textContent = TITLES[sub];
      say('authMsg', pendingMsg, 'err');
      pendingMsg = '';
      updateBanner();
      document.querySelectorAll('form[data-form] button[type=submit]').forEach(function (b) { b.disabled = !sb; });
      if (user && sub !== 'reset') location.hash = returnTo;
    }
    if (view === 'account') { say('profMsg', ''); if (user && !profile) loadProfile(); else fillProfile(); }
  }
  window.FFAuth = { client: function () { return sb; }, guard: guard, show: show, remember: function (h) { returnTo = h; }, user: function () { return user; } };

  renderAcct();
  if (sb) {
    sb.auth.getSession().then(function (res) {
      user = res.data.session ? res.data.session.user : null;
      ready = true;
      renderAcct();
      if (user) setTimeout(loadProfile, 0);
      if (window.FFRoute) window.FFRoute();
    });
    sb.auth.onAuthStateChange(function (event, session) {
      user = session ? session.user : null;
      if (!user) profile = null;
      renderAcct();
      if (event === 'PASSWORD_RECOVERY') location.hash = '#/auth/reset';
      if (user && !profile) setTimeout(loadProfile, 0);
    });
  }
})();

/* ---------- Part 4: page switching (#/library, #/calculator, #/shop) ---------- */
if (typeof document !== 'undefined') (function () {
  const VIEWS = ['home', 'library', 'calculator', 'studio', 'settings', 'auth', 'account', 'dashboard', 'upload'];
  const TITLES = { home: 'Orbrant – 3D-printing platform', library: 'Orbrant Model Library', calculator: 'Orbrant Calculator', studio: 'Orbrant Studio', settings: 'Settings – Orbrant', auth: 'Account – Orbrant', account: 'User Profile – Orbrant', dashboard: 'Creator dashboard – Orbrant', upload: 'Upload a model – Orbrant' };
  function route() {
    const hash = location.hash;
    if (hash && hash.indexOf('#/') !== 0) return; // ignore other anchors such as the skip link
    const parts = hash.replace(/^#\/?/, '').split('/');
    const view = VIEWS.indexOf(parts[0]) >= 0 ? parts[0] : 'home';
    if (window.FFAuth) {
      if (view !== 'auth') window.FFAuth.remember(hash || '#/');
      if (!window.FFAuth.guard(view)) return;
    }
    document.getElementById('acctMenu').open = false;
    VIEWS.forEach(function (n) { document.querySelector('[data-view="' + n + '"]').hidden = n !== view; });
    document.querySelectorAll('#nav a[data-link]').forEach(function (a) {
      if (a.dataset.link === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (view === 'library') window.FFLibrary.show(parts);
    if (view === 'dashboard' && window.FFAuth && window.FFAuth.user()) window.FFLibrary.loadMine();
    if (window.FFAuth) window.FFAuth.show(view, parts);
    document.title = TITLES[view];
    window.scrollTo(0, 0);
  }
  document.getElementById('clearCalc').addEventListener('click', function () {
    if (window.FFCalcReset) window.FFCalcReset();
    document.getElementById('setMsg').textContent = 'Saved calculator data cleared and defaults restored.';
  });
  document.getElementById('setSignOut').addEventListener('click', function () { document.getElementById('signOutBtn').click(); });
  window.addEventListener('hashchange', route);
  window.FFRoute = route;
  route();
})();
