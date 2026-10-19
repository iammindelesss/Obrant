/* FilamentFlow v1
 * Part 1: pure calculation functions (no page access, easy to test and reuse).
 * Part 2: page wiring (only runs in a browser).
 */

// Backend settings (NOT used yet; see "Connecting a backend" in README.md).
// The anon (public) key is designed to be visible in the browser. NEVER put a service_role key here.
const FF_CONFIG = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };

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
    const STORAGE_KEY = 'filamentflow.v1';
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
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
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

/* ---------- Part 3: Model Library (demo) ---------- */
if (typeof document !== 'undefined') (function () {
/* Model Library (demo). MODELS is sample data; later this list comes from the backend (see README.md).
 * To show a real free download, put the file in a models/ folder and set file: 'models/name.stl'. */
const MODELS = [
  { id: 'cable-clip', title: 'Desk cable clip', creator: 'Sample Creator', category: 'Home & Desk', tags: ['organiser', 'clip', 'cable'], premium: false, added: '2026-09-28', formats: ['STL', '3MF'], license: 'CC BY 4.0', file: null,
    desc: 'A small clip that holds charging cables to the edge of a desk.', tips: '0.2 mm layers, 3 walls, 15% infill, no supports.' },
  { id: 'phone-stand', title: 'Folding phone stand', creator: 'Sample Creator', category: 'Home & Desk', tags: ['phone', 'stand'], premium: false, added: '2026-09-12', formats: ['STL'], license: 'CC BY-NC 4.0', file: null,
    desc: 'A two-part phone stand that folds flat for travel.', tips: '0.2 mm layers, 4 walls, 20% infill. Print flat.' },
  { id: 'gear-set', title: 'Modular gear set', creator: 'Demo Workshop', category: 'Mechanical', tags: ['gears', 'mechanical', 'education'], premium: true, added: '2026-10-05', formats: ['STL', '3MF', 'OBJ'], license: 'Commercial licence (demo)', file: null,
    desc: 'Interlocking gears of several sizes for teaching and prototypes.', tips: '0.15 mm layers, 5 walls, 40% infill, PETG recommended.' },
  { id: 'plant-pot', title: 'Geometric plant pot', creator: 'Demo Workshop', category: 'Decor', tags: ['planter', 'vase', 'decor'], premium: false, added: '2026-08-30', formats: ['STL', 'OBJ'], license: 'CC BY 4.0', file: null,
    desc: 'A faceted pot with a drainage tray.', tips: '0.2 mm layers, vase mode for the pot, 3 walls for the tray.' },
  { id: 'dice-tower', title: 'Tabletop dice tower', creator: 'Sample Creator', category: 'Games', tags: ['tabletop', 'dice', 'game'], premium: true, added: '2026-10-14', formats: ['3MF'], license: 'Personal use (demo)', file: null,
    desc: 'A folding dice tower with an internal baffle ramp.', tips: '0.2 mm layers, 3 walls, 10% infill, supports under the top bridge.' },
  { id: 'hex-organiser', title: 'Hex drawer organiser', creator: 'Demo Workshop', category: 'Home & Desk', tags: ['organiser', 'hex', 'storage'], premium: false, added: '2026-07-19', formats: ['STL', '3MF'], license: 'CC0', file: null,
    desc: 'Tessellating hex bins that fill a drawer with no wasted space.', tips: '0.2 mm layers, 2 walls, 10% infill.' }
];

const $ = (id) => document.getElementById(id);
const state = { q: '', cat: 'all', sort: 'newest' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function matches(m) {
  const hay = [m.title, m.desc, m.tags.join(' ')].join(' ').toLowerCase();
  const q = state.q.trim().toLowerCase();
  return (state.cat === 'all' || m.category === state.cat) && (!q || hay.includes(q));
}
function sorted(list) {
  const s = list.slice();
  if (state.sort === 'newest') s.sort((a, b) => b.added.localeCompare(a.added));
  if (state.sort === 'free') s.sort((a, b) => Number(a.premium) - Number(b.premium));
  if (state.sort === 'premium') s.sort((a, b) => Number(b.premium) - Number(a.premium));
  return s;
}
const priceLabel = (m) => (m.premium ? 'Premium (demo)' : 'Free');

function renderList() {
  const list = sorted(MODELS.filter(matches));
  const grid = $('grid');
  grid.innerHTML = '';
  list.forEach((m) => {
    const a = el('a', 'model-card');
    a.href = '#/library/' + m.id;
    a.appendChild(el('div', 'thumb', 'No preview image'));
    const body = el('div', 'body');
    body.appendChild(el('h3', '', m.title));
    body.appendChild(el('p', 'meta', m.creator + ' · ' + priceLabel(m)));
    const tags = el('div', 'tags');
    m.tags.forEach((t) => tags.appendChild(el('span', 'tag', t)));
    body.appendChild(tags);
    a.appendChild(body);
    grid.appendChild(a);
  });
  $('count').textContent = list.length + (list.length === 1 ? ' model' : ' models');
  $('empty').hidden = list.length > 0;
}

function renderDetail(m) {
  const v = $('detailView');
  v.innerHTML = '';
  const back = el('a', 'back', '← All models');
  back.href = '#/library';
  v.appendChild(back);
  v.appendChild(el('h2', '', m.title));
  const wrap = el('div', 'detail');
  wrap.appendChild(el('div', 'thumb', 'No preview image (demo listing)'));
  const dl = el('dl');
  [['Creator', m.creator], ['Price', priceLabel(m)], ['Category', m.category], ['File formats', m.formats.join(', ')],
   ['Licence', m.license], ['Printing recommendations', m.tips], ['Description', m.desc]].forEach((row) => {
    dl.appendChild(el('dt', '', row[0]));
    dl.appendChild(el('dd', '', row[1]));
  });
  const side = el('div');
  side.appendChild(dl);
  if (!m.premium && m.file) {
    const dlink = el('a', 'btn primary', 'Download');
    dlink.href = m.file;
    dlink.setAttribute('download', '');
    side.appendChild(dlink);
  } else {
    const b = el('button', 'btn primary', m.premium ? 'Purchase unavailable' : 'No file in this demo');
    b.disabled = true;
    side.appendChild(b);
    side.appendChild(el('p', 'note-box', m.premium
      ? 'Demo listing. Checkout and secure file delivery are not built yet, so nothing can be bought.'
      : 'Demo listing with no real file attached.'));
  }
  if (window.FFAuth && window.FFAuth.user()) {
    const sv = el('button', 'btn', 'Save (works once listings come from the database)');
    sv.disabled = true; sv.style.marginTop = '12px'; side.appendChild(sv);
  } else {
    const sl = el('a', 'btn', 'Sign in to save models');
    sl.href = '#/auth/signin'; sl.style.marginTop = '12px'; side.appendChild(sl);
  }
  const rep = el('button', 'btn', 'Report this model (needs backend)');
  rep.disabled = true;
  rep.style.marginTop = '12px';
  side.appendChild(rep);
  wrap.appendChild(side);
  v.appendChild(wrap);
}

function show(id) {
  const m = MODELS.find((x) => x.id === id);
  $('listView').hidden = Boolean(m);
  $('detailView').hidden = !m;
  if (m) renderDetail(m);
}

Array.from(new Set(MODELS.map((m) => m.category))).sort().forEach((c) => {
  const o = el('option', '', c); o.value = c; $('cat').appendChild(o);
});
$('q').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderList(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
renderList();
window.FFLibrary = { show: show };
})();

/* ---------- Part 5: accounts (Supabase Auth) ----------
 * Uses the official Supabase client (loaded in index.html). Passwords are handled by Supabase, never by this code.
 * Sessions persist in the browser via the Supabase client. Security is enforced by Row Level Security in the
 * database (see README.md); hiding buttons here is only a convenience. */
if (typeof document !== 'undefined') (function () {
  const $ = (id) => document.getElementById(id);
  const sb = (FF_CONFIG.SUPABASE_URL && FF_CONFIG.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(FF_CONFIG.SUPABASE_URL, FF_CONFIG.SUPABASE_ANON_KEY,
        { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;
  let user = null, profile = null, ready = !sb, returnTo = '#/', pendingMsg = '';
  const redirectUrl = () => location.origin + location.pathname;

  function say(id, text, kind) {
    const m = $(id);
    m.textContent = text || '';
    m.hidden = !text;
    m.className = 'msg ' + (kind || '');
  }
  function friendly(err) {
    const msg = ((err && err.message) || '').toLowerCase(), code = err && err.code;
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
    say('authMsg', 'Account created. Check your email and click the confirmation link, then sign in.', 'ok');
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
  const TITLES = { signin: 'Sign in', register: 'Create account', forgot: 'Reset your password', reset: 'Choose a new password' };
  function guard(view) {
    if ((view === 'account' || view === 'dashboard') && ready && !user) {
      pendingMsg = 'Sign in to continue.';
      location.hash = '#/auth/signin';
      return false;
    }
    return true;
  }
  function show(view, parts) {
    if (view === 'auth') {
      const sub = TITLES[parts[1]] ? parts[1] : 'signin';
      document.querySelectorAll('form[data-form]').forEach(function (f) { f.hidden = f.dataset.form !== sub; });
      $('authTitle').textContent = TITLES[sub];
      say('authMsg', pendingMsg, 'err');
      pendingMsg = '';
      const banner = $('authBanner');
      banner.hidden = false;
      if (!sb) banner.textContent = 'Accounts are not connected yet, so nothing on this page works. Add your Supabase project URL and public key to FF_CONFIG at the top of script.js (see README.md).';
      else if (location.protocol === 'file:') banner.textContent = 'You opened this as a local file. Sign-in may work, but email links (confirm, reset) need the published site or a local web server (see README.md).';
      else banner.hidden = true;
      document.querySelectorAll('form[data-form] button[type=submit]').forEach(function (b) { b.disabled = !sb; });
      if (user && sub !== 'reset') location.hash = returnTo;
    }
    if (view === 'account') { say('profMsg', ''); if (user && !profile) loadProfile(); else fillProfile(); }
  }
  window.FFAuth = { guard: guard, show: show, remember: function (h) { returnTo = h; }, user: function () { return user; } };

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
  const VIEWS = ['home', 'library', 'calculator', 'shop', 'auth', 'account', 'dashboard'];
  const TITLES = { home: 'FilamentFlow – 3D-printing platform', library: 'Model Library – FilamentFlow', calculator: 'Print Calculator – FilamentFlow', shop: 'Print Shop – FilamentFlow', auth: 'Account – FilamentFlow', account: 'Your profile – FilamentFlow', dashboard: 'Creator dashboard – FilamentFlow' };
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
    if (view === 'library') window.FFLibrary.show(parts[1] || null);
    if (window.FFAuth) window.FFAuth.show(view, parts);
    document.title = TITLES[view];
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  window.FFRoute = route;
  route();
})();
