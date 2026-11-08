const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const gen = require('../lib/generators.js');
const parser = require('../lib/parser.js');
const payload = require('../lib/payload.js');

const model = parser.parseLoadData(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-form.json'), 'utf8')));
const q = (title) => model.questions.find((x) => x.title === title);
const ctxFor = (index, csv, seed) => payload.makeContext(gen.createRng(seed ?? index + 1), index, csv);
const valuesOf = (fields, name) => fields.filter(([k]) => k === name).map(([, v]) => v);

test('default config produces a complete submission', () => {
  const { fields, preview } = payload.buildSubmission(model, {}, ctxFor(0));
  assert.strictEqual(preview.length, model.questions.length);
  assert.strictEqual(valuesOf(fields, 'emailAddress').length, 1);
  assert.match(valuesOf(fields, 'emailAddress')[0], /@gmail\.com$/);
  assert.ok(['Nam', 'Nữ'].includes(valuesOf(fields, 'entry.2003')[0]));
  assert.ok(valuesOf(fields, 'entry.2005').length >= 1);
  assert.strictEqual(valuesOf(fields, 'entry.2007').length, 1);
  assert.strictEqual(valuesOf(fields, 'entry.2009_year').length, 1);
  assert.strictEqual(valuesOf(fields, 'entry.2013_year').length, 0, 'no year when includeYear is false');
  assert.strictEqual(valuesOf(fields, 'entry.2013_hour').length, 1, 'time part when includeTime');
  assert.strictEqual(valuesOf(fields, 'entry.2011').length, 0, 'file upload skipped');
});

test('sequential text list uses row i and wraps', () => {
  const stored = { [q('Họ và tên').key]: { mode: 'list', listSource: 'text', listOrder: 'seq', listText: 'An\n\nBình\nChi\n' } };
  const got = [0, 1, 2, 3].map((i) => valuesOf(payload.buildSubmission(model, stored, ctxFor(i)).fields, 'entry.2001')[0]);
  assert.deepStrictEqual(got, ['An', 'Bình', 'Chi', 'An']);
});

test('CSV columns share the same row; random CSV mode keeps rows coherent', () => {
  const csv = { headers: ['Tên', 'Giới tính'], rows: [['An', 'Nam'], ['Bình', 'nữ'], ['Chi', 'Không nói']] };
  const seq = {
    [q('Họ và tên').key]: { mode: 'list', listSource: 'csv', csvColumn: 'Tên', listOrder: 'seq' },
    [q('Giới tính').key]: { mode: 'list', listSource: 'csv', csvColumn: 'Giới tính', listOrder: 'seq' },
  };
  const s1 = payload.buildSubmission(model, seq, ctxFor(1, csv)).fields;
  assert.deepStrictEqual(valuesOf(s1, 'entry.2001'), ['Bình']);
  assert.deepStrictEqual(valuesOf(s1, 'entry.2003'), ['Nữ'], 'loose match maps to real label');
  const s2 = payload.buildSubmission(model, seq, ctxFor(2, csv)).fields;
  assert.deepStrictEqual(valuesOf(s2, 'entry.2003'), ['__other_option__'], 'unmatched value goes to Other');
  assert.deepStrictEqual(valuesOf(s2, 'entry.2003.other_option_response'), ['Không nói']);

  const rnd = {
    [q('Họ và tên').key]: { mode: 'list', listSource: 'csv', csvColumn: 'Tên', listOrder: 'random' },
    [q('Giới tính').key]: { mode: 'list', listSource: 'csv', csvColumn: 'Giới tính', listOrder: 'random' },
  };
  for (let i = 0; i < 30; i++) {
    const f = payload.buildSubmission(model, rnd, ctxFor(i, csv, 100 + i)).fields;
    const name = valuesOf(f, 'entry.2001')[0];
    const row = csv.rows.find((r) => r[0] === name);
    const g = valuesOf(f, 'entry.2003')[0];
    assert.ok(g === '__other_option__' ? row[1] === 'Không nói' : g.toLowerCase() === row[1].toLowerCase());
  }
});

test('weighted single choice follows percentages', () => {
  const stored = { [q('Giới tính').key]: { mode: 'weighted', weights: { Nam: 70, Nữ: 30 } } };
  const rng = gen.createRng(99);
  let nam = 0;
  const n = 5000;
  for (let i = 0; i < n; i++) {
    const v = valuesOf(payload.buildSubmission(model, stored, payload.makeContext(rng, i, null)).fields, 'entry.2003')[0];
    if (v === 'Nam') nam++;
  }
  assert.ok(Math.abs(nam / n - 0.7) < 0.03, String(nam / n));
});

test('weighted checkbox picks each option independently; required never empty', () => {
  const key = q('Sở thích').key;
  const stored = { [key]: { mode: 'weighted', weights: { 'Đọc sách': 100, 'Thể thao': 0, 'Âm nhạc': 50 } } };
  const rng = gen.createRng(5);
  let music = 0;
  for (let i = 0; i < 2000; i++) {
    const v = valuesOf(payload.buildSubmission(model, stored, payload.makeContext(rng, i, null)).fields, 'entry.2005');
    assert.ok(v.includes('Đọc sách'));
    assert.ok(!v.includes('Thể thao'));
    if (v.includes('Âm nhạc')) music++;
  }
  assert.ok(Math.abs(music / 2000 - 0.5) < 0.05);

  const zero = { [key]: { mode: 'weighted', weights: {} } };
  const v = valuesOf(payload.buildSubmission(model, zero, ctxFor(0)).fields, 'entry.2005');
  assert.strictEqual(v.length, 1, 'required checkbox falls back to one option');
});

test('random checkbox respects min/max pick', () => {
  const stored = { [q('Sở thích').key]: { mode: 'random', minPick: 2, maxPick: 3 } };
  for (let i = 0; i < 200; i++) {
    const v = valuesOf(payload.buildSubmission(model, stored, ctxFor(i)).fields, 'entry.2005');
    assert.ok(v.length >= 2 && v.length <= 3);
  }
});

test('checkbox list splits on semicolons', () => {
  const stored = { [q('Sở thích').key]: { mode: 'list', listText: 'Đọc sách; âm nhạc\nDu lịch' } };
  assert.deepStrictEqual(valuesOf(payload.buildSubmission(model, stored, ctxFor(0)).fields, 'entry.2005'), ['Đọc sách', 'Âm nhạc']);
});

test('fixed values, Other text, date and time fields', () => {
  const stored = {
    [q('Giới tính').key]: { mode: 'fixed', fixed: payload.OTHER, otherText: 'Khác giới' },
    [q('Ngày sinh').key]: { mode: 'fixed', fixed: '15/08/2000' },
    [q('Giờ rảnh').key]: { mode: 'fixed', fixed: '7:05' },
    [q('Giới thiệu bản thân').key]: { mode: 'skip' },
  };
  const { fields } = payload.buildSubmission(model, stored, ctxFor(0));
  assert.deepStrictEqual(valuesOf(fields, 'entry.2003'), ['__other_option__']);
  assert.deepStrictEqual(valuesOf(fields, 'entry.2003.other_option_response'), ['Khác giới']);
  assert.deepStrictEqual(
    ['_year', '_month', '_day'].map((s) => valuesOf(fields, 'entry.2009' + s)[0]),
    ['2000', '8', '15'],
  );
  assert.deepStrictEqual([valuesOf(fields, 'entry.2010_hour')[0], valuesOf(fields, 'entry.2010_minute')[0]], ['07', '05']);
  assert.strictEqual(valuesOf(fields, 'entry.2002').length, 0);
});

test('grid per-row config', () => {
  const stored = {
    [q('Đánh giá dịch vụ').key]: { mode: 'random', perRow: true, rows: { 2007: { mode: 'fixed', fixed: 'Tốt' }, 2008: { mode: 'skip' } } },
  };
  const { fields } = payload.buildSubmission(model, stored, ctxFor(0));
  assert.deepStrictEqual(valuesOf(fields, 'entry.2007'), ['Tốt']);
  assert.deepStrictEqual(valuesOf(fields, 'entry.2008'), []);
});

test('buildBody adds page history and fbzx', () => {
  const body = payload.buildBody(model, [['entry.1', 'a'], ['entry.2', 'b'], ['entry.2', 'c']], '-123');
  assert.strictEqual(body.get('pageHistory'), '0,1');
  assert.strictEqual(body.get('fbzx'), '-123');
  assert.strictEqual(body.get('fvv'), '1');
  assert.deepStrictEqual(body.getAll('entry.2'), ['b', 'c']);
  assert.strictEqual(body.get('partialResponse'), '[null,null,"-123"]');
  assert.match(payload.buildBody(model, [], null).get('fbzx'), /^-\d{19}$/);
});

test('looksSubmitted distinguishes the form page from the confirmation page', () => {
  assert.strictEqual(payload.looksSubmitted('<form><input type="hidden" name="fbzx" value="-1"></form>'), false);
  assert.strictEqual(payload.looksSubmitted('<div>Câu trả lời của bạn đã được ghi lại.</div>'), true);
});

test('validation catches errors and warnings', () => {
  const stored = {
    [q('Họ và tên').key]: { mode: 'skip' },
    [q('Giới tính').key]: { mode: 'list', listText: 'Nam\nKhông rõ' },
    [q('Tỉnh thành').key]: { mode: 'list', listText: 'Hà Nội\nHuế' },
    [q('Mức độ hài lòng').key]: { mode: 'weighted', weights: { 1: 10, 2: 10 } },
    [q('Sở thích').key]: { mode: 'random', minPick: 3, maxPick: 1 },
    [q('Ngày sinh').key]: { mode: 'list', listSource: 'csv', csvColumn: 'Ngày' },
  };
  const issues = payload.validate(model, stored, null, { count: 5, delayMin: 1, delayMax: 2 });
  const msgs = (title) => issues.filter((i) => i.title === title).map((i) => `${i.level}:${i.msg}`);
  assert.ok(msgs('Họ và tên').some((m) => m.startsWith('error:Câu bắt buộc')));
  assert.ok(msgs('Giới tính').every((m) => !m.includes('không khớp')), 'Other absorbs unmatched values');
  assert.ok(msgs('Giới tính').some((m) => m.startsWith('warn:List có 2')));
  assert.ok(msgs('Tỉnh thành').some((m) => m.includes('"Huế"')));
  assert.ok(msgs('Mức độ hài lòng').some((m) => m.includes('Tổng tỉ lệ là 20%')));
  assert.ok(msgs('Sở thích').some((m) => m.startsWith('error:Số đáp án tối thiểu')));
  assert.ok(msgs('Ngày sinh').some((m) => m.includes('Chưa import file CSV')));
  assert.ok(msgs('Tuổi').some((m) => m.startsWith('warn:Câu này có điều kiện')));
  assert.ok(msgs('Tải CV').some((m) => m.startsWith('warn:Câu upload')));

  const runIssues = payload.validate(model, {}, null, { count: 0, delayMin: 3, delayMax: 1 });
  assert.strictEqual(runIssues.filter((i) => i.title === 'Cài đặt chạy').length, 2);
});

test('default config has no errors', () => {
  const issues = payload.validate(model, {}, null, { count: 3, delayMin: 0, delayMax: 0 });
  assert.deepStrictEqual(issues.filter((i) => i.level === 'error'), []);
});
