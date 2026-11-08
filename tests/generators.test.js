const test = require('node:test');
const assert = require('node:assert');
const gen = require('../lib/generators.js');

test('rng is deterministic for a seed', () => {
  const a = gen.createRng(42);
  const b = gen.createRng(42);
  for (let i = 0; i < 5; i++) assert.strictEqual(a(), b());
});

test('randInt stays within inclusive bounds and hits both ends', () => {
  const rng = gen.createRng(1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = gen.randInt(rng, 3, 6);
    assert.ok(v >= 3 && v <= 6);
    seen.add(v);
  }
  assert.deepStrictEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('weightedIndex follows weights within tolerance', () => {
  const rng = gen.createRng(7);
  const counts = [0, 0, 0];
  const n = 20000;
  for (let i = 0; i < n; i++) counts[gen.weightedIndex(rng, [60, 30, 10])]++;
  assert.ok(Math.abs(counts[0] / n - 0.6) < 0.02);
  assert.ok(Math.abs(counts[1] / n - 0.3) < 0.02);
  assert.ok(Math.abs(counts[2] / n - 0.1) < 0.02);
});

test('weightedIndex is uniform when all weights are zero and never picks zero weights otherwise', () => {
  const rng = gen.createRng(9);
  const counts = [0, 0];
  for (let i = 0; i < 4000; i++) counts[gen.weightedIndex(rng, [0, 0])]++;
  assert.ok(counts[0] > 1700 && counts[1] > 1700);
  for (let i = 0; i < 1000; i++) assert.notStrictEqual(gen.weightedIndex(rng, [0, 5, 0]), 0);
});

test('pickK returns distinct items in original order', () => {
  const rng = gen.createRng(3);
  for (let i = 0; i < 100; i++) {
    const out = gen.pickK(rng, ['a', 'b', 'c', 'd'], 2);
    assert.strictEqual(out.length, 2);
    assert.notStrictEqual(out[0], out[1]);
    assert.ok('abcd'.indexOf(out[0]) < 'abcd'.indexOf(out[1]));
  }
});

test('generators produce plausible values', () => {
  const rng = gen.createRng(5);
  assert.match(gen.genEmail(rng), /^[a-z._]+\d+@gmail\.com$/);
  assert.match(gen.genPhone(rng), /^0[35789]\d{8}$/);
  assert.strictEqual(gen.genName(rng).split(' ').length, 3);
  const n = Number(gen.generate(rng, { generator: 'number', numMin: 18, numMax: 20 }));
  assert.ok(n >= 18 && n <= 20);
  const words = gen.generate(rng, { generator: 'words', wordMin: 4, wordMax: 4 });
  assert.strictEqual(words.split(' ').length, 4);
});

test('stripDiacritics handles Vietnamese', () => {
  assert.strictEqual(gen.stripDiacritics('Đặng Thị Ngọc Ánh'), 'Dang Thi Ngoc Anh');
});

test('parseDate accepts ISO and DD/MM/YYYY, rejects invalid dates', () => {
  assert.deepStrictEqual(gen.parseDate('2024-02-29'), { y: 2024, m: 2, d: 29 });
  assert.deepStrictEqual(gen.parseDate('05/03/2024'), { y: 2024, m: 3, d: 5 });
  assert.deepStrictEqual(gen.parseDate('2024-03-05 14:30'), { y: 2024, m: 3, d: 5, h: 14, mi: 30 });
  assert.strictEqual(gen.parseDate('2023-02-29'), null);
  assert.strictEqual(gen.parseDate('abc'), null);
});

test('randomDate and randomTime stay in range', () => {
  const rng = gen.createRng(11);
  for (let i = 0; i < 200; i++) {
    const d = gen.randomDate(rng, '2024-01-30', '2024-02-02');
    const iso = gen.formatDate(d);
    assert.ok(iso >= '2024-01-30' && iso <= '2024-02-02', iso);
    const t = gen.randomTime(rng, '08:15', '08:45');
    const mins = t.h * 60 + t.mi;
    assert.ok(mins >= 495 && mins <= 525);
  }
});
