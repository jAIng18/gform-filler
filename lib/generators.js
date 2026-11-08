// Random helpers and value generators. Shared by content script, side panel and Node tests.
(function (root) {
  'use strict';
  const GFF = root.GFF || (root.GFF = {});

  // mulberry32: small, fast, seedable PRNG returning floats in [0, 1).
  function createRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  // Inclusive integer range.
  function randInt(rng, min, max) {
    min = Math.ceil(Number(min));
    max = Math.floor(Number(max));
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(rng() * (max - min + 1));
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // Index chosen with probability proportional to weights; uniform when all weights are 0.
  function weightedIndex(rng, weights) {
    const clean = weights.map((w) => (Number.isFinite(Number(w)) && Number(w) > 0 ? Number(w) : 0));
    const total = clean.reduce((s, w) => s + w, 0);
    if (total <= 0) return Math.floor(rng() * clean.length);
    let r = rng() * total;
    for (let i = 0; i < clean.length; i++) {
      r -= clean[i];
      if (r < 0) return i;
    }
    return clean.length - 1;
  }

  // k distinct elements, keeping their original order.
  function pickK(rng, arr, k) {
    const idx = arr.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, Math.max(0, Math.min(k, arr.length))).sort((a, b) => a - b).map((i) => arr[i]);
  }

  function stripDiacritics(s) {
    return String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
  const MIDDLE = ['Văn', 'Thị', 'Hữu', 'Minh', 'Ngọc', 'Thanh', 'Quốc', 'Gia', 'Đức', 'Thu', 'Hoài', 'Anh', 'Bảo', 'Xuân', 'Kim', 'Phương'];
  const FIRST = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hoa', 'Hùng', 'Huy', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'Nam', 'Nga', 'Ngân', 'Nhung', 'Phúc', 'Phương', 'Quân', 'Quang', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Trung', 'Tú', 'Tuấn', 'Uyên', 'Vy', 'Yến'];
  const WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat'];

  function genName(rng) {
    return `${pick(rng, LAST)} ${pick(rng, MIDDLE)} ${pick(rng, FIRST)}`;
  }

  function genEmail(rng) {
    const first = stripDiacritics(pick(rng, FIRST)).toLowerCase();
    const last = stripDiacritics(pick(rng, LAST)).toLowerCase();
    const sep = pick(rng, ['', '.', '_']);
    return `${first}${sep}${last}${randInt(rng, 1, 9999)}@gmail.com`;
  }

  function genPhone(rng) {
    let s = '0' + pick(rng, ['3', '5', '7', '8', '9']);
    for (let i = 0; i < 8; i++) s += String(randInt(rng, 0, 9));
    return s;
  }

  function genWords(rng, min, max) {
    const n = randInt(rng, Math.max(1, Number(min) || 1), Math.max(1, Number(max) || 1));
    const words = [];
    for (let i = 0; i < n; i++) words.push(pick(rng, WORDS));
    const s = words.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Generator config: { generator, numMin, numMax, wordMin, wordMax }.
  function generate(rng, cfg) {
    switch (cfg.generator) {
      case 'number':
        return String(randInt(rng, cfg.numMin ?? 1, cfg.numMax ?? 100));
      case 'name':
        return genName(rng);
      case 'email':
        return genEmail(rng);
      case 'phone':
        return genPhone(rng);
      case 'words':
      default:
        return genWords(rng, cfg.wordMin ?? 3, cfg.wordMax ?? 8);
    }
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  // Accepts YYYY-MM-DD or DD/MM/YYYY (also with "-" or "."), optionally followed by " HH:MM".
  function parseDate(s) {
    if (s == null) return null;
    const str = String(s).trim();
    let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
    let y, mo, d, h, mi;
    if (m) {
      [, y, mo, d, h, mi] = m;
    } else {
      m = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
      if (!m) return null;
      [, d, mo, y, h, mi] = m;
    }
    const out = { y: Number(y), m: Number(mo), d: Number(d) };
    const dt = new Date(Date.UTC(out.y, out.m - 1, out.d));
    if (dt.getUTCFullYear() !== out.y || dt.getUTCMonth() !== out.m - 1 || dt.getUTCDate() !== out.d) return null;
    if (h != null) {
      out.h = Number(h);
      out.mi = Number(mi);
      if (out.h > 23 || out.mi > 59) return null;
    }
    return out;
  }

  function formatDate(p) {
    return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  }

  function parseTime(s) {
    if (s == null) return null;
    const m = String(s).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const t = { h: Number(m[1]), mi: Number(m[2]), s: Number(m[3] || 0) };
    if (t.mi > 59 || t.s > 59) return null;
    return t;
  }

  function formatTime(t, withSeconds) {
    return `${pad2(t.h)}:${pad2(t.mi)}` + (withSeconds ? `:${pad2(t.s)}` : '');
  }

  function randomDate(rng, start, end) {
    const a = parseDate(start);
    const b = parseDate(end);
    if (!a || !b) return null;
    const da = Date.UTC(a.y, a.m - 1, a.d) / 86400000;
    const db = Date.UTC(b.y, b.m - 1, b.d) / 86400000;
    const day = randInt(rng, da, db);
    const dt = new Date(day * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  function randomTime(rng, start, end) {
    const a = parseTime(start);
    const b = parseTime(end);
    if (!a || !b) return null;
    const total = randInt(rng, a.h * 60 + a.mi, b.h * 60 + b.mi);
    return { h: Math.floor(total / 60), mi: total % 60, s: 0 };
  }

  function todayISO(offsetDays) {
    const d = new Date(Date.now() + (offsetDays || 0) * 86400000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  GFF.gen = {
    createRng, randomSeed, randInt, pick, weightedIndex, pickK, stripDiacritics,
    genName, genEmail, genPhone, genWords, generate,
    parseDate, formatDate, parseTime, formatTime, randomDate, randomTime, todayISO,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GFF.gen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
