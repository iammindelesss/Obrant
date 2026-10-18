/* FilamentFlow v1
 * Part 1: pure calculation functions (no page access, easy to test and reuse).
 * Part 2: page wiring (only runs in a browser).
 */

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
