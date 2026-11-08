const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
require('../lib/generators.js');
const parser = require('../lib/parser.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-form.json'), 'utf8'));

test('parses title, pages and email collection', () => {
  const m = parser.parseLoadData(data);
  assert.strictEqual(m.title, 'Form khảo sát test');
  assert.strictEqual(m.pageCount, 2);
  assert.strictEqual(m.questions[0].key, 'emailAddress');
  assert.strictEqual(m.questions[0].field, 'emailAddress');
});

test('maps question types, entries and required flags', () => {
  const m = parser.parseLoadData(data);
  const byTitle = Object.fromEntries(m.questions.map((q) => [q.title, q]));
  assert.strictEqual(byTitle['Họ và tên'].type, 'text');
  assert.strictEqual(byTitle['Họ và tên'].entryId, 2001);
  assert.strictEqual(byTitle['Họ và tên'].required, true);
  assert.strictEqual(byTitle['Giới thiệu bản thân'].required, false);

  const gender = byTitle['Giới tính'];
  assert.strictEqual(gender.type, 'choice');
  assert.deepStrictEqual(gender.options.map((o) => o.label), ['Nam', 'Nữ']);
  assert.strictEqual(gender.hasOther, true);

  assert.strictEqual(byTitle['Sở thích'].type, 'checkbox');
  assert.strictEqual(byTitle['Mức độ hài lòng'].type, 'scale');
  assert.deepStrictEqual(byTitle['Mức độ hài lòng'].scaleLabels, ['Rất tệ', 'Rất tốt']);
  assert.strictEqual(byTitle['Tải CV'].type, 'file');
  assert.strictEqual(byTitle['Tuổi'].hasValidation, true);
  assert.ok(!('Ảnh minh họa' in byTitle));
});

test('grid rows, date and time flags, page numbers', () => {
  const m = parser.parseLoadData(data);
  const byTitle = Object.fromEntries(m.questions.map((q) => [q.title, q]));
  const grid = byTitle['Đánh giá dịch vụ'];
  assert.strictEqual(grid.type, 'grid');
  assert.strictEqual(grid.page, 1);
  assert.deepStrictEqual(grid.rows, [
    { entryId: 2007, label: 'Nhân viên', required: true },
    { entryId: 2008, label: 'Giá cả', required: false },
  ]);
  assert.strictEqual(grid.gridCheckbox, false);
  assert.strictEqual(byTitle['Ngày sinh'].includeYear, true);
  assert.strictEqual(byTitle['Ngày sinh'].includeTime, false);
  assert.strictEqual(byTitle['Lịch họp'].includeTime, true);
  assert.strictEqual(byTitle['Lịch họp'].includeYear, false);
  assert.strictEqual(byTitle['Giờ rảnh'].duration, false);
  assert.strictEqual(byTitle['Họ và tên'].page, 0);
});

test('extracts load data from script text and html', () => {
  const json = JSON.stringify(data);
  const script = `var FB_PUBLIC_LOAD_DATA_ = ${json}\n;`;
  assert.deepStrictEqual(parser.extractFromScriptText(script), data);
  const html = `<html><script>var x = 1;</script><script nonce="a">${script}</script></html>`;
  assert.deepStrictEqual(parser.extractFromHtml(html), data);
});

test('form key from various URLs', () => {
  assert.strictEqual(parser.formKeyFromUrl('https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform?usp=sf_link'), '1FAIpQLSabc');
  assert.strictEqual(parser.formKeyFromUrl('https://docs.google.com/forms/u/1/d/e/1FAIpQLSxyz/formResponse'), '1FAIpQLSxyz');
  assert.strictEqual(parser.formKeyFromUrl('https://example.com/'), null);
});
