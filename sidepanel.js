'use strict';
const { gen, payload, csv: csvLib } = globalThis.GFF;
const OTHER = payload.OTHER;
const CONTENT_FILES = ['lib/generators.js', 'lib/parser.js', 'lib/csv.js', 'lib/payload.js', 'content.js'];
const FORM_URL_RE = /^https:\/\/docs\.google\.com\/forms\//;

const TYPE_LABEL = {
  text: 'Trả lời ngắn', paragraph: 'Đoạn văn', choice: 'Trắc nghiệm', dropdown: 'Menu thả xuống',
  checkbox: 'Hộp kiểm', scale: 'Thang đo', rating: 'Đánh giá', grid: 'Lưới', date: 'Ngày', time: 'Giờ',
  file: 'Tải tệp lên', email: 'Email',
};
const GENERATORS = [
  ['words', 'Chuỗi từ (lorem ipsum)'],
  ['name', 'Họ tên tiếng Việt'],
  ['email', 'Email'],
  ['phone', 'Số điện thoại'],
  ['number', 'Số nguyên'],
];

const app = document.getElementById('app');
const S = {
  tabId: null,
  model: null,
  error: null,
  store: null,
  runState: null,
  schedules: {},
  runMsg: null, // { level, title, items, proceed }
  preview: null,
  csvMsg: '',
  resetArmed: false,
  cfgMsg: '',
};

// ---------- DOM helper ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') value = v;
    else if (k === 'checked') el.checked = true;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendKids(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}
// Nested arrays are flattened; null/false/'' are skipped.
function appendKids(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
}
function setKids(el, ...kids) {
  el.replaceChildren();
  appendKids(el, kids);
}
const field = (label, control) => h('label', { class: 'field' }, h('span', { text: label }), control);
const badge = (t) => h('span', { class: 'badge', text: t });
const num = (v) => (v === '' || v == null ? '' : Number(v));

function select(options, value, onChange) {
  return h(
    'select',
    { value, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, text: label })),
  );
}

// ---------- storage ----------
function emptyStore() {
  return { questions: {}, run: { count: 10, startRow: 1, delayMin: 1, delayMax: 3 }, csv: null };
}
const storeKey = () => 'cfg:' + S.model.formKey;

async function loadStore() {
  const key = storeKey();
  const saved = (await chrome.storage.local.get(key))[key] || {};
  const base = emptyStore();
  S.store = { ...base, ...saved, run: { ...base.run, ...(saved.run || {}) }, questions: saved.questions || {} };
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  const key = storeKey();
  const data = S.store;
  saveTimer = setTimeout(() => chrome.storage.local.set({ [key]: data }), 300);
}

async function loadSchedules() {
  S.schedules = (await chrome.storage.local.get('schedules')).schedules || {};
}

const cfgOf = (q) => payload.getConfig(q, S.store.questions);

// ---------- tab messaging ----------
async function sendToTab(msg) {
  try {
    return await chrome.tabs.sendMessage(S.tabId, msg);
  } catch (e) {
    await chrome.scripting.executeScript({ target: { tabId: S.tabId }, files: CONTENT_FILES });
    return await chrome.tabs.sendMessage(S.tabId, msg);
  }
}

async function refresh(reload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  Object.assign(S, { tabId: tab ? tab.id : null, model: null, error: null, runState: null, runMsg: null, preview: null, csvMsg: '' });
  if (!tab || !tab.url || !FORM_URL_RE.test(tab.url)) {
    S.error = 'Hãy mở một Google Form (link …/viewform) ở tab hiện tại.';
    return render();
  }
  try {
    const res = await sendToTab({ type: 'gff:getForm', reload: !!reload });
    S.model = res.model;
    S.error = res.error;
    S.runState = res.state;
  } catch (e) {
    S.error = 'Không kết nối được với trang form. Hãy tải lại trang (F5) rồi thử lại.';
  }
  if (S.model) {
    await loadStore();
    await loadSchedules();
  }
  render();
}

// ---------- question editors ----------
// A "ctl" lets one editor read and write a config, whether it is a whole question or one grid row.
function questionCtl(q, rerender, refreshIssues) {
  return {
    q: q.type === 'grid' ? payload.gridRowQuestion(q, { entryId: 'all', label: '', required: q.required }) : q,
    get cfg() {
      return cfgOf(q);
    },
    set(patch, full) {
      S.store.questions[q.key] = { ...cfgOf(q), ...patch };
      save();
      if (full) rerender();
      else refreshIssues();
    },
  };
}

function rowCtl(parent, gridQ, row) {
  return {
    q: payload.gridRowQuestion(gridQ, row),
    get cfg() {
      return payload.gridRowConfig(gridQ, parent.cfg, row);
    },
    set(patch, full) {
      const c = parent.cfg;
      const rows = { ...(c.rows || {}) };
      rows[row.entryId] = { ...payload.gridRowConfig(gridQ, c, row), ...patch };
      parent.set({ rows }, full);
    },
  };
}

function modesFor(q) {
  let modes;
  if (payload.isText(q)) modes = [['generator', 'Ngẫu nhiên (tự sinh)'], ['fixed', 'Giá trị cố định'], ['list', 'Lấy từ list']];
  else if (q.type === 'date' || q.type === 'time') modes = [['random', 'Ngẫu nhiên trong khoảng'], ['fixed', 'Giá trị cố định'], ['list', 'Lấy từ list']];
  else if (q.type === 'checkbox') modes = [['random', 'Ngẫu nhiên (số đáp án trong khoảng)'], ['weighted', 'Tỉ lệ % cho từng đáp án'], ['fixed', 'Giá trị cố định'], ['list', 'Lấy từ list']];
  else modes = [['random', 'Ngẫu nhiên đều'], ['weighted', 'Ngẫu nhiên theo tỉ lệ %'], ['fixed', 'Giá trị cố định'], ['list', 'Lấy từ list']];
  if (!q.required) modes.push(['skip', 'Bỏ trống']);
  return modes;
}

function modeEditor(ctl) {
  return [
    field('Cách điền', select(modesFor(ctl.q), ctl.cfg.mode, (v) => ctl.set({ mode: v }, true))),
    editorFor(ctl),
  ];
}

function editorFor(ctl) {
  const { q } = ctl;
  const cfg = ctl.cfg;
  switch (cfg.mode) {
    case 'random':
      if (q.type === 'checkbox') return pickRangeEditor(ctl);
      if (q.type === 'date') return dateRangeEditor(ctl);
      if (q.type === 'time') return timeRangeEditor(ctl);
      return h('div', { class: 'muted', text: `Chọn đều 1 trong ${q.options.length} đáp án${q.hasOther ? ' (không chọn "Khác")' : ''}.` });
    case 'weighted':
      return weightsEditor(ctl);
    case 'fixed':
      return fixedEditor(ctl);
    case 'list':
      return listEditor(ctl);
    case 'generator':
      return generatorEditor(ctl);
    case 'skip':
      return h('div', { class: 'muted', text: 'Câu này sẽ được để trống.' });
    default:
      return null;
  }
}

function pickRangeEditor(ctl) {
  const cfg = ctl.cfg;
  const n = ctl.q.options.length;
  return h(
    'div',
    { class: 'row' },
    field('Chọn ít nhất', h('input', { type: 'number', min: 0, max: n, value: cfg.minPick, oninput: (e) => ctl.set({ minPick: num(e.target.value) }) })),
    field('Nhiều nhất', h('input', { type: 'number', min: 1, max: n, value: cfg.maxPick, oninput: (e) => ctl.set({ maxPick: num(e.target.value) }) })),
  );
}

function dateRangeEditor(ctl) {
  const cfg = ctl.cfg;
  return [
    h(
      'div',
      { class: 'row' },
      field('Từ ngày', h('input', { type: 'date', value: cfg.rangeStart, onchange: (e) => ctl.set({ rangeStart: e.target.value }) })),
      field('Đến ngày', h('input', { type: 'date', value: cfg.rangeEnd, onchange: (e) => ctl.set({ rangeEnd: e.target.value }) })),
    ),
    ctl.q.includeTime && timeRangeEditor(ctl),
  ];
}

function timeRangeEditor(ctl) {
  const cfg = ctl.cfg;
  return h(
    'div',
    { class: 'row' },
    field('Từ giờ', h('input', { type: 'time', value: cfg.timeStart, onchange: (e) => ctl.set({ timeStart: e.target.value }) })),
    field('Đến giờ', h('input', { type: 'time', value: cfg.timeEnd, onchange: (e) => ctl.set({ timeEnd: e.target.value }) })),
  );
}

function weightsEditor(ctl) {
  const { q } = ctl;
  const cfg = ctl.cfg;
  const independent = q.type === 'checkbox';
  const keys = q.options.map((o) => [o.label, o.label]);
  if (q.hasOther) keys.push([OTHER, 'Khác (nhập nội dung bên dưới)']);
  const sumEl = h('div', { class: 'sum' });
  const updateSum = () => {
    if (independent) return;
    const s = payload.sumWeights(q, ctl.cfg);
    sumEl.textContent = `Tổng: ${Math.round(s * 100) / 100}%` + (Math.abs(s - 100) > 0.01 ? ' (sẽ tự chuẩn hóa về 100%)' : '');
    sumEl.className = 'sum ' + (Math.abs(s - 100) > 0.01 ? 'warn' : 'ok');
  };
  const grid = h(
    'div',
    { class: 'weights' },
    keys.map(([key, label]) => [
      h('span', { class: 'lbl', text: label }),
      h('input', {
        type: 'number', min: 0, max: 100, step: 'any', value: (cfg.weights || {})[key] ?? '', placeholder: '%',
        oninput: (e) => {
          ctl.set({ weights: { ...(ctl.cfg.weights || {}), [key]: num(e.target.value) } });
          updateSum();
        },
      }),
    ]),
  );
  const equalize = () => {
    const share = independent ? 50 : Math.round((100 / q.options.length) * 100) / 100;
    const weights = {};
    q.options.forEach((o) => (weights[o.label] = share));
    ctl.set({ weights }, true);
  };
  updateSum();
  return [
    h('div', { class: 'muted', text: independent ? 'Mỗi đáp án được tick độc lập với xác suất bằng % đã nhập.' : 'Xác suất chọn từng đáp án (%).' }),
    grid,
    sumEl,
    h('div', { class: 'btns' }, h('button', { class: 'small', onclick: equalize, text: independent ? 'Đặt tất cả 50%' : 'Chia đều' })),
    q.hasOther && otherTextInput(ctl),
  ];
}

function otherTextInput(ctl) {
  return field('Nội dung khi chọn "Khác"', h('input', { type: 'text', value: ctl.cfg.otherText, oninput: (e) => ctl.set({ otherText: e.target.value }) }));
}

function fixedEditor(ctl) {
  const { q } = ctl;
  const cfg = ctl.cfg;
  if (payload.isChoice(q)) {
    const opts = q.options.map((o) => [o.label, o.label]);
    if (q.hasOther) opts.push([OTHER, 'Khác…']);
    return [
      field('Đáp án', select(opts, cfg.fixed, (v) => ctl.set({ fixed: v }, true))),
      cfg.fixed === OTHER && otherTextInput(ctl),
    ];
  }
  if (q.type === 'checkbox') {
    const fixed = Array.isArray(cfg.fixed) ? cfg.fixed : [];
    const toggle = (label, on) => {
      const cur = new Set(Array.isArray(ctl.cfg.fixed) ? ctl.cfg.fixed : []);
      if (on) cur.add(label);
      else cur.delete(label);
      ctl.set({ fixed: Array.from(cur) }, label === OTHER);
    };
    const items = q.options.map((o) => [o.label, o.label]);
    if (q.hasOther) items.push([OTHER, 'Khác…']);
    return [
      h(
        'div',
        { class: 'checks' },
        items.map(([v, label]) =>
          h('label', {}, h('input', { type: 'checkbox', checked: fixed.includes(v), onchange: (e) => toggle(v, e.target.checked) }), label),
        ),
      ),
      fixed.includes(OTHER) && otherTextInput(ctl),
    ];
  }
  if (q.type === 'date') {
    const p = gen.parseDate(cfg.fixed);
    const pad = (n) => String(n).padStart(2, '0');
    if (q.includeTime) {
      const v = p ? `${gen.formatDate(p)}T${pad(p.h ?? 9)}:${pad(p.mi ?? 0)}` : '';
      return field('Ngày giờ', h('input', { type: 'datetime-local', value: v, onchange: (e) => ctl.set({ fixed: e.target.value }) }));
    }
    return field('Ngày', h('input', { type: 'date', value: p ? gen.formatDate(p) : '', onchange: (e) => ctl.set({ fixed: e.target.value }) }));
  }
  if (q.type === 'time') {
    return field('Giờ', h('input', { type: 'time', step: q.duration ? 1 : 60, value: cfg.fixed, onchange: (e) => ctl.set({ fixed: e.target.value }) }));
  }
  const attrs = { value: cfg.fixed ?? '', oninput: (e) => ctl.set({ fixed: e.target.value }) };
  return field('Giá trị', q.type === 'paragraph' ? h('textarea', attrs) : h('input', { type: 'text', ...attrs }));
}

function listPlaceholder(q) {
  if (q.type === 'checkbox') return 'Mỗi dòng dùng cho một lần gửi.\nNhiều đáp án trên một dòng ngăn bằng dấu ;\nVí dụ: Đọc sách; Du lịch';
  if (q.type === 'date') return 'Mỗi dòng một ngày: YYYY-MM-DD hoặc DD/MM/YYYY';
  if (q.type === 'time') return 'Mỗi dòng một giờ: HH:MM';
  return 'Mỗi dòng một giá trị';
}

function listEditor(ctl) {
  const { q } = ctl;
  const cfg = ctl.cfg;
  const csv = S.store.csv;
  const countEl = h('div', { class: 'muted' });
  const updateCount = () => {
    const n = payload.listValues(ctl.cfg, S.store.csv).length;
    countEl.textContent = `${n} giá trị.`;
  };
  let source;
  if (cfg.listSource === 'csv') {
    source = csv
      ? field('Cột CSV', select([['', '— chọn cột —'], ...csv.headers.map((hd) => [hd, hd])], cfg.csvColumn, (v) => {
        ctl.set({ csvColumn: v });
        updateCount();
      }))
      : h('div', { class: 'muted', text: 'Chưa có file CSV. Import ở mục "Dữ liệu CSV" bên dưới.' });
  } else {
    const ta = h('textarea', {
      rows: 5,
      placeholder: listPlaceholder(q),
      value: cfg.listText,
      oninput: (e) => {
        ctl.set({ listText: e.target.value });
        updateCount();
      },
    });
    const fileInput = h('input', {
      type: 'file', accept: '.txt,.csv', hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        ta.value = (await f.text()).replace(/^\uFEFF/, '');
        ctl.set({ listText: ta.value });
        updateCount();
      },
    });
    source = [
      ta,
      h('div', { class: 'btns' }, h('button', { class: 'small', text: 'Nạp từ file .txt', onclick: () => fileInput.click() }), fileInput),
    ];
  }
  updateCount();
  const name = 'src-' + Math.random().toString(36).slice(2);
  return [
    h(
      'div',
      { class: 'radios' },
      [['text', 'Dán danh sách'], ['csv', 'Cột trong file CSV']].map(([v, label]) =>
        h('label', {}, h('input', { type: 'radio', name, checked: cfg.listSource === v, onchange: () => ctl.set({ listSource: v }, true) }), label),
      ),
    ),
    field('Thứ tự lấy', select([['seq', 'Lần lượt (lần 1 → dòng 1, lần 2 → dòng 2…)'], ['random', 'Ngẫu nhiên']], cfg.listOrder, (v) => ctl.set({ listOrder: v }))),
    source,
    countEl,
    (payload.isChoice(q) || q.type === 'checkbox') &&
      h('div', { class: 'muted', text: `Đáp án hợp lệ: ${q.options.map((o) => o.label).join(' | ')}${q.hasOther ? ' (giá trị khác sẽ vào ô "Khác")' : ''}` }),
  ];
}

function generatorEditor(ctl) {
  const cfg = ctl.cfg;
  const sample = h('div', { class: 'muted' });
  const showSamples = () => {
    const rng = gen.createRng(gen.randomSeed());
    sample.textContent = 'Ví dụ: ' + [0, 1, 2].map(() => gen.generate(rng, ctl.cfg)).join(' · ');
  };
  let extra = null;
  if (cfg.generator === 'number') {
    extra = h(
      'div',
      { class: 'row' },
      field('Từ', h('input', { type: 'number', value: cfg.numMin, oninput: (e) => ctl.set({ numMin: num(e.target.value) }) })),
      field('Đến', h('input', { type: 'number', value: cfg.numMax, oninput: (e) => ctl.set({ numMax: num(e.target.value) }) })),
    );
  } else if (cfg.generator === 'words') {
    extra = h(
      'div',
      { class: 'row' },
      field('Số từ ít nhất', h('input', { type: 'number', min: 1, value: cfg.wordMin, oninput: (e) => ctl.set({ wordMin: num(e.target.value) }) })),
      field('Nhiều nhất', h('input', { type: 'number', min: 1, value: cfg.wordMax, oninput: (e) => ctl.set({ wordMax: num(e.target.value) }) })),
    );
  }
  showSamples();
  return [
    field('Kiểu dữ liệu', select(GENERATORS, cfg.generator, (v) => ctl.set({ generator: v }, true))),
    extra,
    h('div', { class: 'btns' }, h('button', { class: 'small', text: 'Ví dụ khác', onclick: showSamples })),
    sample,
  ];
}

function issuesBox(issues) {
  if (!issues.length) return null;
  return h('div', { class: 'issues' }, issues.map((i) => h('div', { class: 'issue ' + i.level, text: i.msg })));
}

function questionCard(q, idx) {
  const card = h('div', { class: 'card' });
  const issuesHolder = h('div');
  const refreshIssues = () => setKids(issuesHolder, issuesBox(payload.validateQuestion(q, cfgOf(q), S.store.csv, S.store.run)));
  const fill = () => {
    const ctl = questionCtl(q, fill, refreshIssues);
    let body;
    if (q.type === 'file') {
      body = h('div', { class: 'muted', text: 'Không hỗ trợ câu upload file.' });
    } else if (q.type === 'grid') {
      const cfg = ctl.cfg;
      body = [
        h('div', { class: 'checks' }, h('label', {}, h('input', { type: 'checkbox', checked: cfg.perRow, onchange: (e) => ctl.set({ perRow: e.target.checked }, true) }), 'Cấu hình riêng từng hàng')),
        cfg.perRow
          ? q.rows.map((row) => h('div', { class: 'card sub' }, h('div', { class: 'card-head', text: row.label + (row.required ? ' *' : '') }), modeEditor(rowCtl(ctl, q, row))))
          : [h('div', { class: 'muted', text: `Áp dụng chung cho ${q.rows.length} hàng: ${q.rows.map((r) => r.label).join(', ')}` }), modeEditor(ctl)],
      ];
    } else {
      body = modeEditor(ctl);
    }
    setKids(
      card,
      h('div', { class: 'card-head' }, h('span', { text: `${idx + 1}.` }), h('span', { class: 'qtitle', text: q.title }), q.required && h('span', { class: 'req', text: '*' })),
      h(
        'div',
        { class: 'badges' },
        badge(q.type === 'grid' ? (q.gridCheckbox ? 'Lưới hộp kiểm' : 'Lưới trắc nghiệm') : TYPE_LABEL[q.type] || q.type),
        S.model.pageCount > 1 && badge(`Trang ${q.page + 1}`),
        q.hasValidation && badge('Có kiểm tra câu trả lời'),
      ),
      body,
      issuesHolder,
    );
    refreshIssues();
  };
  fill();
  card._refreshIssues = refreshIssues;
  return card;
}

function refreshAllIssues() {
  document.querySelectorAll('.card').forEach((c) => c._refreshIssues && c._refreshIssues());
}

// ---------- CSV ----------
async function importCsv(file) {
  const parsed = csvLib.parseCSV(await file.text());
  if (!parsed.headers.length) {
    S.csvMsg = 'File CSV trống.';
    return render();
  }
  S.store.csv = { name: file.name, headers: parsed.headers, rows: parsed.rows };
  const matched = applyCsvAutoMap();
  S.csvMsg = `Đã nạp ${parsed.rows.length} dòng, ${parsed.headers.length} cột. Tự khớp ${matched} câu hỏi theo tiêu đề cột.`;
  save();
  render();
}

function applyCsvAutoMap() {
  const eligible = S.model.questions.filter((q) => q.type !== 'file' && q.type !== 'grid');
  const map = csvLib.autoMap(S.store.csv.headers, eligible);
  for (const q of eligible) {
    if (!map[q.key]) continue;
    S.store.questions[q.key] = { ...cfgOf(q), mode: 'list', listSource: 'csv', csvColumn: map[q.key], listOrder: 'seq' };
  }
  const gridMap = csvLib.autoMapGrid(S.store.csv.headers, S.model.questions);
  let gridRows = 0;
  for (const q of S.model.questions) {
    const rowMap = gridMap[q.key];
    if (!rowMap) continue;
    const cfg = cfgOf(q);
    const rows = { ...(cfg.rows || {}) };
    for (const [entryId, header] of Object.entries(rowMap)) {
      rows[entryId] = { ...(rows[entryId] || {}), mode: 'list', listSource: 'csv', csvColumn: header, listOrder: 'seq' };
      gridRows++;
    }
    S.store.questions[q.key] = { ...cfg, perRow: true, rows };
  }
  return Object.keys(map).length + gridRows;
}

function csvSection() {
  const csv = S.store.csv;
  const fileInput = h('input', { type: 'file', accept: '.csv,.txt', onchange: (e) => e.target.files[0] && importCsv(e.target.files[0]) });
  const used = new Set(
    S.model.questions.map((q) => cfgOf(q)).filter((c) => c.mode === 'list' && c.listSource === 'csv').map((c) => c.csvColumn),
  );
  return [
    h('div', { class: 'muted', text: 'Một file cho cả form: mỗi cột là một câu hỏi, mỗi dòng là một lần gửi. Dòng đầu là tiêu đề cột; cột trùng tên câu hỏi sẽ được tự khớp.' }),
    csv
      ? [
        h('div', { class: 'box info' }, h('b', { text: csv.name }), ` · ${csv.rows.length} dòng`, h('ul', {}, csv.headers.map((hd) => h('li', { text: hd + (used.has(hd) ? '  ✓ đang dùng' : '') })))),
        h(
          'div',
          { class: 'btns' },
          h('button', { text: 'Tự khớp lại cột', onclick: () => { S.csvMsg = `Tự khớp ${applyCsvAutoMap()} câu hỏi.`; save(); render(); } }),
          h('button', { class: 'danger', text: 'Xóa CSV', onclick: () => { S.store.csv = null; S.csvMsg = ''; save(); render(); } }),
        ),
        h('div', { class: 'field' }, h('span', { text: 'Thay bằng file khác' }), fileInput),
      ]
      : h('div', { class: 'field' }, fileInput),
    S.csvMsg && h('div', { class: 'muted', text: S.csvMsg }),
  ];
}

// ---------- run ----------
function runSettings() {
  const r = S.store.run;
  const set = (patch) => {
    Object.assign(S.store.run, patch);
    save();
    refreshAllIssues();
  };
  return [
    h(
      'div',
      { class: 'row' },
      field('Số lần gửi', h('input', { type: 'number', min: 1, value: r.count, oninput: (e) => set({ count: num(e.target.value) }) })),
      field('Bắt đầu từ dòng', h('input', { type: 'number', min: 1, value: r.startRow, title: 'Dùng cho list lần lượt: lần gửi đầu tiên lấy dòng này.', oninput: (e) => set({ startRow: num(e.target.value) }) })),
    ),
    h(
      'div',
      { class: 'row' },
      field('Delay tối thiểu (giây)', h('input', { type: 'number', min: 0, step: 'any', value: r.delayMin, oninput: (e) => set({ delayMin: num(e.target.value) }) })),
      field('Delay tối đa (giây)', h('input', { type: 'number', min: 0, step: 'any', value: r.delayMax, oninput: (e) => set({ delayMax: num(e.target.value) }) })),
    ),
  ];
}

function runPayload() {
  return { config: S.store.questions, csv: S.store.csv, run: { ...S.store.run } };
}

// Returns true when it is OK to go ahead; otherwise shows the problems (and a "run anyway" button for warnings).
function checkBeforeRun(proceed) {
  const issues = payload.validate(S.model, S.store.questions, S.store.csv, S.store.run);
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const fmt = (i) => `${i.title}: ${i.msg}`;
  if (errors.length) {
    S.runMsg = { level: 'error', title: 'Cần sửa trước khi chạy:', items: errors.map(fmt) };
  } else if (warns.length) {
    S.runMsg = { level: 'warn', title: 'Lưu ý:', items: warns.map(fmt), proceed };
  } else {
    S.runMsg = null;
    proceed();
    return;
  }
  renderRun();
}

async function startRun() {
  S.runMsg = null;
  S.preview = null;
  try {
    const res = await sendToTab({ type: 'gff:start', payload: runPayload() });
    if (!res.ok) S.runMsg = { level: 'error', title: 'Không bắt đầu được:', items: [res.error] };
  } catch (e) {
    S.runMsg = { level: 'error', title: 'Không bắt đầu được:', items: ['Mất kết nối với trang form. Hãy tải lại trang.'] };
  }
  renderRun();
}

function showPreview() {
  const rng = gen.createRng(gen.randomSeed());
  const index = Math.max(0, (Number(S.store.run.startRow) || 1) - 1);
  S.preview = payload.buildSubmission(S.model, S.store.questions, payload.makeContext(rng, index, S.store.csv)).preview;
  renderRun();
}

const control = (type) => sendToTab({ type }).catch(() => {});

function runStatusText(st) {
  let status = st.running ? (st.paused ? 'Đang tạm dừng' : 'Đang chạy') : st.stopReason;
  if (st.running && !st.paused && st.nextAt) status += ` · lần tiếp sau ${Math.max(0, Math.ceil((st.nextAt - Date.now()) / 1000))}s`;
  return status;
}

function runStatus() {
  const st = S.runState;
  const running = !!(st && st.running);
  const parts = [];
  parts.push(
    h(
      'div',
      { class: 'btns' },
      h('button', { text: 'Xem thử 1 lần', onclick: showPreview, disabled: running }),
      h('button', { class: 'primary', text: 'Bắt đầu chạy', disabled: running, onclick: () => checkBeforeRun(startRun) }),
      running && h('button', { text: st.paused ? 'Tiếp tục' : 'Tạm dừng', onclick: () => control(st.paused ? 'gff:resume' : 'gff:pause') }),
      running && h('button', { class: 'danger', text: 'Dừng', onclick: () => control('gff:stop') }),
    ),
  );
  if (S.runMsg) {
    const m = S.runMsg;
    parts.push(
      h(
        'div',
        { class: 'box ' + m.level },
        h('b', { text: m.title }),
        h('ul', {}, m.items.map((t) => h('li', { text: t }))),
        m.proceed && h('div', { class: 'btns' }, h('button', { class: 'primary small', text: 'Vẫn chạy', onclick: () => { S.runMsg = null; m.proceed(); } }), h('button', { class: 'small', text: 'Hủy', onclick: () => { S.runMsg = null; renderRun(); } })),
      ),
    );
  }
  if (S.preview) {
    parts.push(
      h('table', { class: 'preview' }, h('tbody', {}, S.preview.map((p) => h('tr', {}, h('td', { text: p.title }), h('td', { text: p.value || '(trống)' }))))),
    );
  }
  if (st && (st.running || st.finishedAt)) {
    const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    const status = runStatusText(st);
    parts.push(
      h('div', { class: 'progress' }, h('div', { style: `width:${pct}%` })),
      h('div', { class: 'stats' }, h('span', { text: `${st.done}/${st.total}` }), h('span', { class: 'ok', text: `✓ ${st.ok}` }), h('span', { class: 'bad', text: `✗ ${st.fail}` })),
      h('div', { class: 'muted', id: 'run-status-text', text: status }),
      h(
        'div',
        { class: 'log' },
        st.log.slice().reverse().map((l) =>
          h(
            'div',
            { class: 'log-item' },
            h('span', { class: l.ok ? 'st-ok' : 'st-bad', text: `#${l.n} ${l.ok ? '✓' : '✗'} ` }),
            l.msg,
            l.preview && h('div', { class: 'pv', text: l.preview }),
          ),
        ),
      ),
    );
  }
  return parts;
}

function renderRun() {
  const el = document.getElementById('run-status');
  if (el) setKids(el, runStatus());
}

// ---------- schedule ----------
function scheduleSection() {
  const mine = Object.values(S.schedules).filter((s) => s.formKey === S.model.formKey).sort((a, b) => a.when - b.when);
  const input = h('input', { type: 'datetime-local' });
  const msg = h('div', { class: 'muted' });
  const create = async () => {
    const when = input.value ? new Date(input.value).getTime() : NaN;
    if (!(when > Date.now())) {
      msg.textContent = 'Hãy chọn một thời điểm trong tương lai.';
      return;
    }
    const errors = payload.validate(S.model, S.store.questions, S.store.csv, S.store.run).filter((i) => i.level === 'error');
    if (errors.length) {
      msg.textContent = `Còn ${errors.length} lỗi cấu hình, hãy bấm "Bắt đầu chạy" để xem chi tiết.`;
      return;
    }
    const id = Date.now().toString(36);
    await loadSchedules();
    S.schedules[id] = { id, formKey: S.model.formKey, formTitle: S.model.title, formUrl: S.model.url, when, payload: runPayload() };
    await chrome.storage.local.set({ schedules: S.schedules });
    await chrome.alarms.create('gff:' + id, { when });
    render();
  };
  const cancel = async (id) => {
    await chrome.alarms.clear('gff:' + id);
    await loadSchedules();
    delete S.schedules[id];
    await chrome.storage.local.set({ schedules: S.schedules });
    render();
  };
  return [
    h('div', { class: 'muted', text: 'Đến giờ, extension tự mở form trong tab mới và chạy với cấu hình hiện tại (chụp lại lúc tạo lịch). Chrome phải đang mở và máy không ngủ.' }),
    h('div', { class: 'row' }, field('Thời điểm chạy', input), h('button', { class: 'primary', text: 'Lên lịch', onclick: create })),
    msg,
    mine.map((s) =>
      h(
        'div',
        { class: 'sched' },
        h('span', { text: `${new Date(s.when).toLocaleString('vi-VN')} · ${s.payload.run.count} lần` }),
        h('button', { class: 'small danger', text: 'Hủy', onclick: () => cancel(s.id) }),
      ),
    ),
  ];
}

// ---------- config import/export ----------
function configSection() {
  const exportCfg = () => {
    const data = { app: 'gform-filler', version: 1, formKey: S.model.formKey, formTitle: S.model.title, questions: S.store.questions, run: S.store.run, csv: S.store.csv };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `gform-filler-${S.model.formKey.slice(0, 12)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importInput = h('input', {
    type: 'file', accept: '.json', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || !data.questions || typeof data.questions !== 'object') throw new Error('File không đúng định dạng.');
        const base = emptyStore();
        S.store = { questions: data.questions, run: { ...base.run, ...(data.run || {}) }, csv: data.csv || null };
        save();
        S.cfgMsg = data.formKey && data.formKey !== S.model.formKey
          ? 'Đã nhập, nhưng file là của form khác: chỉ những câu trùng ID mới được áp dụng.'
          : 'Đã nhập cấu hình.';
      } catch (err) {
        S.cfgMsg = 'Lỗi: ' + err.message;
      }
      render();
    },
  });
  const reset = () => {
    if (!S.resetArmed) {
      S.resetArmed = true;
      resetBtn.textContent = 'Bấm lần nữa để xóa';
      setTimeout(() => {
        S.resetArmed = false;
        resetBtn.textContent = 'Xóa cấu hình';
      }, 3000);
      return;
    }
    S.resetArmed = false;
    S.store = emptyStore();
    save();
    render();
  };
  const resetBtn = h('button', { class: 'danger', text: 'Xóa cấu hình', onclick: reset });
  const msg = S.cfgMsg;
  S.cfgMsg = '';
  return [
    h('div', { class: 'muted', text: 'Cấu hình được tự lưu theo từng form. Bạn có thể xuất ra file để sao lưu hoặc dùng ở máy khác.' }),
    h('div', { class: 'btns' }, h('button', { text: 'Xuất file cấu hình', onclick: exportCfg }), h('button', { text: 'Nhập file cấu hình', onclick: () => importInput.click() }), resetBtn, importInput),
    msg && h('div', { class: 'box info', text: msg }),
  ];
}

// ---------- layout ----------
function section(title, note, content, open) {
  return h('details', { class: 'section', open: open !== false }, h('summary', {}, h('span', { text: title }), note && h('span', { class: 'summary-note', text: note })), h('div', { class: 'body' }, content));
}

function render() {
  if (!S.model) {
    setKids(
      app,
      h('header', { class: 'top' }, h('div', { class: 'titles' }, h('h1', { text: 'GForm Filler' })), h('button', { class: 'small', text: 'Tải lại', onclick: () => refresh(true) })),
      h('div', { class: 'empty', text: S.error || 'Đang tải…' }),
    );
    return;
  }
  const m = S.model;
  const errorCount = payload.validate(m, S.store.questions, S.store.csv, S.store.run).filter((i) => i.level === 'error').length;
  setKids(
    app,
    h(
      'header',
      { class: 'top' },
      h('div', { class: 'titles' }, h('h1', { text: m.title }), h('div', { class: 'sub', text: `${m.questions.length} câu hỏi · ${m.pageCount} trang` })),
      h('button', { class: 'small', text: 'Tải lại form', onclick: () => refresh(true) }),
    ),
    m.emailMode === 2 && h('div', { class: 'box warn', text: 'Form thu thập email đã xác minh (bắt buộc đăng nhập): mọi câu trả lời sẽ mang email tài khoản Google của bạn, và nếu form giới hạn 1 lần trả lời thì chỉ lần đầu thành công.' }),
    m.unsupported.length > 0 && h('div', { class: 'box warn', text: `Có ${m.unsupported.length} câu thuộc loại chưa hỗ trợ và sẽ bị bỏ qua: ${m.unsupported.map((q) => q.title).join(', ')}` }),
    section('Câu hỏi', errorCount ? `${errorCount} lỗi` : '', m.questions.map((q, i) => questionCard(q, i))),
    section('Dữ liệu CSV', S.store.csv ? `${S.store.csv.rows.length} dòng` : 'tuỳ chọn', csvSection(), !!S.store.csv),
    section('Chạy', '', [runSettings(), h('div', { id: 'run-status' })]),
    section('Lên lịch', '', scheduleSection(), false),
    section('Cấu hình', '', configSection(), !!S.cfgMsg),
  );
  renderRun();
}

// ---------- events ----------
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'gff:progress' && sender.tab && sender.tab.id === S.tabId) {
    S.runState = msg.state;
    renderRun();
  }
});
let myWindowId = null;
chrome.windows.getCurrent().then((w) => (myWindowId = w.id));
chrome.tabs.onActivated.addListener((info) => {
  if (myWindowId == null || info.windowId === myWindowId) refresh();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === S.tabId && info.status === 'complete') refresh();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.schedules && S.model) {
    S.schedules = changes.schedules.newValue || {};
  }
});
// Keep the "next submission in Xs" countdown fresh.
setInterval(() => {
  const el = document.getElementById('run-status-text');
  if (el && S.runState && S.runState.running) el.textContent = runStatusText(S.runState);
}, 1000);

refresh();
