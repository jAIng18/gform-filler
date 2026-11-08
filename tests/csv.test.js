const test = require('node:test');
const assert = require('node:assert');
require('../lib/generators.js');
const csv = require('../lib/csv.js');

test('parses quotes, escaped quotes, commas and CRLF', () => {
  const text = 'Họ và tên,Ghi chú\r\n"Nguyễn Văn A","Xin chào, ""bạn"""\r\nTrần Thị B,dòng\nmới\r\n';
  const out = csv.parseCSV(text);
  assert.deepStrictEqual(out.headers, ['Họ và tên', 'Ghi chú']);
  assert.deepStrictEqual(out.rows[0], ['Nguyễn Văn A', 'Xin chào, "bạn"']);
  assert.strictEqual(out.rows.length, 3);
});

test('quoted newline stays in one field', () => {
  const out = csv.parseCSV('a,b\n"x\ny",z\n');
  assert.deepStrictEqual(out.rows, [['x\ny', 'z']]);
});

test('strips UTF-8 BOM and detects semicolon delimiter', () => {
  const out = csv.parseCSV(String.fromCharCode(0xfeff) + 'Tên;Tuổi\nAn;20\n\nBình;21');
  assert.deepStrictEqual(out.headers, ['Tên', 'Tuổi']);
  assert.deepStrictEqual(out.rows, [['An', '20'], ['Bình', '21']]);
});

test('pads short rows', () => {
  const out = csv.parseCSV('a,b,c\n1\n');
  assert.deepStrictEqual(out.rows, [['1', '', '']]);
});

test('auto maps headers to question titles ignoring case and diacritics', () => {
  const questions = [
    { key: 'q1', title: 'Họ và tên' },
    { key: 'q2', title: 'Giới tính?' },
    { key: 'q3', title: 'Không có cột' },
    { key: 'emailAddress', title: 'Email người trả lời' },
  ];
  const map = csv.autoMap(['ho va ten', 'GIỚI TÍNH', 'emailAddress'], questions);
  assert.deepStrictEqual(map, { q1: 'ho va ten', q2: 'GIỚI TÍNH', emailAddress: 'emailAddress' });
});

test('auto maps grid rows by row label or "Title [row]" header', () => {
  const questions = [
    { key: 'g1', type: 'grid', title: 'TỐC ĐỘ\n(ghi chú)', rows: [{ entryId: 11, label: 'Hàng một.' }, { entryId: 12, label: 'Hàng hai' }, { entryId: 13, label: 'Không có' }] },
    { key: 'q1', type: 'choice', title: 'Hàng một.' },
  ];
  const map = csv.autoMapGrid(['hang mot', 'TỐC ĐỘ (ghi chú) [Hàng hai]'], questions);
  assert.deepStrictEqual(map, { g1: { 11: 'hang mot', 12: 'TỐC ĐỘ (ghi chú) [Hàng hai]' } });
});
