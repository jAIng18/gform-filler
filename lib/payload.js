// Per-question config defaults, answer generation, POST body building and validation.
(function (root) {
  'use strict';
  const GFF = root.GFF || (root.GFF = {});
  const gen = GFF.gen || (typeof require === 'function' ? require('./generators.js') : null);
  const OTHER = '__other__';

  const CHOICE_TYPES = new Set(['choice', 'dropdown', 'scale', 'rating']);
  const TEXT_TYPES = new Set(['text', 'paragraph', 'email']);

  const isChoice = (q) => CHOICE_TYPES.has(q.type);
  const isText = (q) => TEXT_TYPES.has(q.type);

  function defaultConfig(q) {
    const base = { mode: 'random', weights: {}, fixed: '', otherText: '', listSource: 'text', listText: '', listOrder: 'seq', csvColumn: '' };
    if (isChoice(q)) return { ...base, fixed: q.options[0] ? q.options[0].label : '' };
    if (q.type === 'checkbox') {
      return { ...base, fixed: [], minPick: 1, maxPick: Math.max(1, Math.ceil(q.options.length / 2)) };
    }
    if (isText(q)) {
      return {
        ...base,
        mode: 'generator',
        generator: q.type === 'email' ? 'email' : 'words',
        numMin: 1, numMax: 100, wordMin: q.type === 'paragraph' ? 8 : 2, wordMax: q.type === 'paragraph' ? 25 : 5,
      };
    }
    if (q.type === 'date') {
      return { ...base, rangeStart: gen.todayISO(-365), rangeEnd: gen.todayISO(0), timeStart: '08:00', timeEnd: '18:00' };
    }
    if (q.type === 'time') return { ...base, timeStart: '08:00', timeEnd: '18:00' };
    if (q.type === 'grid') {
      return { ...base, fixed: q.options[0] ? q.options[0].label : '', minPick: 1, maxPick: 1, perRow: false, rows: {} };
    }
    return { ...base, mode: 'skip' };
  }

  function getConfig(q, stored) {
    return { ...defaultConfig(q), ...((stored && stored[q.key]) || {}) };
  }

  // Shape a grid row so it can reuse the choice/checkbox answer logic.
  function gridRowQuestion(q, row) {
    return {
      key: `${q.key}:${row.entryId}`,
      title: row.label,
      type: q.gridCheckbox ? 'checkbox' : 'choice',
      options: q.options,
      hasOther: false,
      required: row.required,
    };
  }

  function gridRowConfig(q, cfg, row) {
    if (!cfg.perRow) return cfg;
    const rq = gridRowQuestion(q, row);
    return { ...defaultConfig(rq), ...((cfg.rows && cfg.rows[row.entryId]) || {}) };
  }

  function splitLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s !== '');
  }

  // ctx: { rng, index, csv, csvRandomRow }
  function makeContext(rng, index, csv) {
    const rows = csv && Array.isArray(csv.rows) ? csv.rows.length : 0;
    return { rng, index, csv, csvRandomRow: rows ? gen.randInt(rng, 0, rows - 1) : 0 };
  }

  function listValues(cfg, csv) {
    if (cfg.listSource === 'csv') {
      if (!csv || !csv.headers) return [];
      const col = csv.headers.indexOf(cfg.csvColumn);
      if (col < 0) return [];
      return csv.rows.map((r) => String(r[col] == null ? '' : r[col]).trim());
    }
    return splitLines(cfg.listText);
  }

  // Raw string from the list for this submission, or null when the cell/list is empty.
  function listValue(cfg, ctx) {
    const values = listValues(cfg, ctx.csv);
    if (!values.length) return null;
    let i;
    if (cfg.listOrder === 'random') {
      // CSV rows stay coherent: every CSV-random question uses the same row.
      i = cfg.listSource === 'csv' ? ctx.csvRandomRow % values.length : Math.floor(ctx.rng() * values.length);
    } else {
      i = ctx.index % values.length;
    }
    const v = values[i];
    return v === '' ? null : v;
  }

  // Maps a raw value to an option: exact, then case/diacritic-insensitive, then "Other".
  function matchOption(q, raw) {
    const s = String(raw).trim();
    const exact = q.options.find((o) => o.label === s);
    if (exact) return { label: exact.label };
    const norm = (x) => gen.stripDiacritics(String(x)).toLowerCase().replace(/\s+/g, ' ').trim();
    const loose = q.options.find((o) => norm(o.label) === norm(s));
    if (loose) return { label: loose.label };
    if (q.hasOther) return { other: s };
    return { invalid: s };
  }

  // Single answer for choice-like questions: { label } | { other } | { invalid } | null.
  function answerChoice(q, cfg, ctx) {
    const labels = q.options.map((o) => o.label);
    switch (cfg.mode) {
      case 'skip':
        return null;
      case 'fixed':
        if (cfg.fixed === OTHER) return { other: cfg.otherText || '' };
        return cfg.fixed ? { label: cfg.fixed } : null;
      case 'list': {
        const raw = listValue(cfg, ctx);
        return raw == null ? null : matchOption(q, raw);
      }
      case 'weighted': {
        const cands = labels.slice();
        if (q.hasOther && cfg.otherText) cands.push(OTHER);
        const weights = cands.map((l) => (cfg.weights || {})[l] || 0);
        const pickd = cands[gen.weightedIndex(ctx.rng, weights)];
        return pickd === OTHER ? { other: cfg.otherText } : { label: pickd };
      }
      case 'random':
      default:
        return labels.length ? { label: gen.pick(ctx.rng, labels) } : null;
    }
  }

  // Multiple answers for checkbox questions: { labels: [], other, invalid: [] }.
  function answerCheckbox(q, cfg, ctx) {
    const labels = q.options.map((o) => o.label);
    const out = { labels: [], other: null, invalid: [] };
    switch (cfg.mode) {
      case 'skip':
        return out;
      case 'fixed': {
        const fixed = Array.isArray(cfg.fixed) ? cfg.fixed : [];
        out.labels = labels.filter((l) => fixed.includes(l));
        if (fixed.includes(OTHER)) out.other = cfg.otherText || '';
        return out;
      }
      case 'list': {
        const raw = listValue(cfg, ctx);
        if (raw == null) return out;
        for (const part of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
          const m = matchOption(q, part);
          if (m.label && !out.labels.includes(m.label)) out.labels.push(m.label);
          else if (m.other) out.other = m.other;
          else if (m.invalid) out.invalid.push(m.invalid);
        }
        out.labels = labels.filter((l) => out.labels.includes(l));
        return out;
      }
      case 'weighted': {
        const w = cfg.weights || {};
        out.labels = labels.filter((l) => ctx.rng() * 100 < (Number(w[l]) || 0));
        if (q.hasOther && cfg.otherText && ctx.rng() * 100 < (Number(w[OTHER]) || 0)) out.other = cfg.otherText;
        if (q.required && !out.labels.length && out.other == null && labels.length) {
          const best = labels.reduce((a, b) => ((Number(w[b]) || 0) > (Number(w[a]) || 0) ? b : a));
          out.labels = [best];
        }
        return out;
      }
      case 'random':
      default: {
        const lo = Math.max(q.required ? 1 : 0, Math.min(Number(cfg.minPick) || 0, labels.length));
        const hi = Math.max(lo, Math.min(Number(cfg.maxPick) || lo, labels.length));
        out.labels = gen.pickK(ctx.rng, labels, gen.randInt(ctx.rng, lo, hi));
        return out;
      }
    }
  }

  function answerText(q, cfg, ctx) {
    switch (cfg.mode) {
      case 'skip':
        return null;
      case 'fixed':
        return cfg.fixed === '' || cfg.fixed == null ? null : String(cfg.fixed);
      case 'list':
        return listValue(cfg, ctx);
      case 'generator':
      default:
        return gen.generate(ctx.rng, cfg);
    }
  }

  // Returns { date: {y,m,d}, time: {h,mi} | null } | { invalid } | null.
  function answerDate(q, cfg, ctx) {
    let p = null;
    let raw = null;
    if (cfg.mode === 'skip') return null;
    if (cfg.mode === 'fixed' || cfg.mode === 'list') {
      raw = cfg.mode === 'fixed' ? cfg.fixed : listValue(cfg, ctx);
      if (raw == null || raw === '') return null;
      p = gen.parseDate(raw);
      if (!p) return { invalid: raw };
    } else {
      p = gen.randomDate(ctx.rng, cfg.rangeStart, cfg.rangeEnd);
      if (!p) return { invalid: `${cfg.rangeStart} → ${cfg.rangeEnd}` };
      if (q.includeTime) {
        const t = gen.randomTime(ctx.rng, cfg.timeStart, cfg.timeEnd);
        if (t) [p.h, p.mi] = [t.h, t.mi];
      }
    }
    const time = p.h != null ? { h: p.h, mi: p.mi } : q.includeTime ? { h: 9, mi: 0 } : null;
    return { date: { y: p.y, m: p.m, d: p.d }, time };
  }

  function answerTime(q, cfg, ctx) {
    if (cfg.mode === 'skip') return null;
    if (cfg.mode === 'fixed' || cfg.mode === 'list') {
      const raw = cfg.mode === 'fixed' ? cfg.fixed : listValue(cfg, ctx);
      if (raw == null || raw === '') return null;
      const t = gen.parseTime(raw);
      return t || { invalid: raw };
    }
    return gen.randomTime(ctx.rng, cfg.timeStart, cfg.timeEnd) || { invalid: `${cfg.timeStart} → ${cfg.timeEnd}` };
  }

  const fieldName = (q) => q.field || `entry.${q.entryId}`;

  function pushChoiceFields(fields, name, ans) {
    if (!ans) return '';
    if (ans.other != null) {
      fields.push([name, '__other_option__']);
      fields.push([`${name}.other_option_response`, ans.other]);
      return `Khác: ${ans.other}`;
    }
    const v = ans.label != null ? ans.label : ans.invalid;
    fields.push([name, v]);
    return ans.invalid != null ? `${v} (không khớp đáp án)` : v;
  }

  function pushCheckboxFields(fields, name, ans) {
    ans.labels.forEach((l) => fields.push([name, l]));
    if (ans.other != null) {
      fields.push([name, '__other_option__']);
      fields.push([`${name}.other_option_response`, ans.other]);
    }
    const shown = ans.labels.slice();
    if (ans.other != null) shown.push(`Khác: ${ans.other}`);
    ans.invalid.forEach((v) => shown.push(`${v} (không khớp)`));
    return shown.join('; ');
  }

  // Answers for one submission: { fields: [[name, value]], preview: [{ key, title, value }] }.
  function buildSubmission(model, stored, ctx) {
    const fields = [];
    const preview = [];
    const pad2 = (n) => String(n).padStart(2, '0');
    for (const q of model.questions) {
      const cfg = getConfig(q, stored);
      const name = fieldName(q);
      let shown = '';
      if (q.type === 'file') {
        shown = '(không hỗ trợ upload file)';
      } else if (isChoice(q)) {
        shown = pushChoiceFields(fields, name, answerChoice(q, cfg, ctx));
      } else if (q.type === 'checkbox') {
        shown = pushCheckboxFields(fields, name, answerCheckbox(q, cfg, ctx));
      } else if (q.type === 'grid') {
        const parts = [];
        for (const row of q.rows) {
          const rq = gridRowQuestion(q, row);
          const rcfg = gridRowConfig(q, cfg, row);
          const rname = `entry.${row.entryId}`;
          const v = rq.type === 'checkbox'
            ? pushCheckboxFields(fields, rname, answerCheckbox(rq, rcfg, ctx))
            : pushChoiceFields(fields, rname, answerChoice(rq, rcfg, ctx));
          if (v) parts.push(`${row.label}: ${v}`);
        }
        shown = parts.join(' | ');
      } else if (isText(q)) {
        const v = answerText(q, cfg, ctx);
        if (v != null) {
          fields.push([name, v]);
          shown = v;
        }
      } else if (q.type === 'date') {
        const a = answerDate(q, cfg, ctx);
        if (a && a.invalid != null) {
          shown = `${a.invalid} (ngày không hợp lệ)`;
        } else if (a) {
          if (q.includeYear !== false) fields.push([`${name}_year`, String(a.date.y)]);
          fields.push([`${name}_month`, String(a.date.m)]);
          fields.push([`${name}_day`, String(a.date.d)]);
          shown = `${pad2(a.date.d)}/${pad2(a.date.m)}/${a.date.y}`;
          if (a.time) {
            fields.push([`${name}_hour`, pad2(a.time.h)]);
            fields.push([`${name}_minute`, pad2(a.time.mi)]);
            shown += ` ${pad2(a.time.h)}:${pad2(a.time.mi)}`;
          }
        }
      } else if (q.type === 'time') {
        const t = answerTime(q, cfg, ctx);
        if (t && t.invalid != null) {
          shown = `${t.invalid} (giờ không hợp lệ)`;
        } else if (t) {
          fields.push([`${name}_hour`, pad2(t.h)]);
          fields.push([`${name}_minute`, pad2(t.mi)]);
          if (q.duration) fields.push([`${name}_second`, pad2(t.s || 0)]);
          shown = gen.formatTime(t, q.duration);
        }
      }
      preview.push({ key: q.key, title: q.title, value: shown });
    }
    return { fields, preview };
  }

  function randomFbzx() {
    let s = '-';
    for (let i = 0; i < 19; i++) s += String(i === 0 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10));
    return s;
  }

  function buildBody(model, fields, fbzx) {
    const body = new URLSearchParams();
    for (const [k, v] of fields) body.append(k, v);
    const token = fbzx || randomFbzx();
    body.append('fvv', '1');
    body.append('partialResponse', JSON.stringify([null, null, token]));
    body.append('pageHistory', Array.from({ length: model.pageCount || 1 }, (_, i) => i).join(','));
    body.append('fbzx', token);
    return body;
  }

  // The fillable form (initial or re-rendered with validation errors) carries the hidden fbzx input;
  // the "response recorded" page does not.
  function looksSubmitted(html) {
    return !/name="fbzx"/.test(String(html || ''));
  }

  function sumWeights(q, cfg) {
    const w = cfg.weights || {};
    const keys = q.options.map((o) => o.label);
    if (q.hasOther && cfg.otherText) keys.push(OTHER);
    return keys.reduce((s, k) => s + (Number(w[k]) || 0), 0);
  }

  // Issues for one question: [{ level: 'error' | 'warn', msg }].
  function validateQuestion(q, cfg, csv, run) {
    const issues = [];
    const err = (msg) => issues.push({ level: 'error', msg });
    const warn = (msg) => issues.push({ level: 'warn', msg });
    const total = (Number(run && run.count) || 1) + Math.max(0, (Number(run && run.startRow) || 1) - 1);

    if (q.type === 'file') {
      if (q.required) err('Câu upload file bắt buộc: không thể gửi tự động.');
      else warn('Câu upload file sẽ được bỏ trống.');
      return issues;
    }
    if (cfg.mode === 'skip' && q.required) err('Câu bắt buộc không thể bỏ trống.');

    const checkList = (c, target) => {
      if (c.mode !== 'list') return;
      if (c.listSource === 'csv') {
        if (!csv || !csv.headers || !csv.headers.length) return err('Chưa import file CSV.');
        if (!csv.headers.includes(c.csvColumn)) return err('Chưa chọn cột CSV hợp lệ.');
      }
      const values = listValues(c, csv);
      if (!values.length) return err('List đang trống.');
      if (c.listOrder !== 'random' && values.length < total) {
        warn(`List có ${values.length} giá trị nhưng cần ${total} lần: sẽ quay lại từ đầu.`);
      }
      if (target.required && values.some((v) => v === '')) warn('Có ô trống trong list, câu bắt buộc sẽ bị thiếu ở lần đó.');
      if (isChoice(target) || target.type === 'checkbox') {
        const bad = new Set();
        for (const v of values) {
          const parts = target.type === 'checkbox' ? v.split(';').map((s) => s.trim()).filter(Boolean) : [v];
          parts.forEach((p) => {
            if (p !== '' && matchOption(target, p).invalid != null) bad.add(p);
          });
        }
        if (bad.size) {
          const sample = Array.from(bad).slice(0, 3).map((s) => `"${s}"`).join(', ');
          err(`${bad.size} giá trị không khớp đáp án nào: ${sample}${bad.size > 3 ? '…' : ''}`);
        }
      }
      if (target.type === 'date' && values.some((v) => v !== '' && !gen.parseDate(v))) err('Có giá trị ngày sai định dạng (dùng YYYY-MM-DD hoặc DD/MM/YYYY).');
      if (target.type === 'time' && values.some((v) => v !== '' && !gen.parseTime(v))) err('Có giá trị giờ sai định dạng (dùng HH:MM).');
    };

    const checkChoiceLike = (target, c) => {
      if (c.mode === 'weighted') {
        if (target.type === 'checkbox') {
          const w = c.weights || {};
          if (!target.options.some((o) => Number(w[o.label]) > 0)) warn('Tất cả tỉ lệ đang là 0%.');
        } else {
          const s = sumWeights(target, c);
          if (s <= 0) warn('Tất cả tỉ lệ đang là 0%: sẽ chọn đều.');
          else if (Math.abs(s - 100) > 0.01) warn(`Tổng tỉ lệ là ${s}%: sẽ tự chuẩn hóa về 100%.`);
        }
      }
      if (c.mode === 'random' && target.type === 'checkbox' && Number(c.minPick) > Number(c.maxPick)) err('Số đáp án tối thiểu lớn hơn tối đa.');
      if (c.mode === 'fixed' && target.required) {
        const empty = target.type === 'checkbox' ? !(Array.isArray(c.fixed) && c.fixed.length) : !c.fixed;
        if (empty) err('Chưa chọn giá trị cố định.');
      }
      checkList(c, target);
    };

    if (isChoice(q) || q.type === 'checkbox') {
      checkChoiceLike(q, cfg);
    } else if (q.type === 'grid') {
      if (cfg.perRow) {
        q.rows.forEach((row) => {
          const rq = gridRowQuestion(q, row);
          const before = issues.length;
          checkChoiceLike(rq, gridRowConfig(q, cfg, row));
          for (let i = before; i < issues.length; i++) issues[i].msg = `[${row.label}] ${issues[i].msg}`;
        });
      } else {
        checkChoiceLike(gridRowQuestion(q, { label: '', required: q.required }), cfg);
      }
    } else if (isText(q)) {
      if (cfg.mode === 'fixed' && q.required && !cfg.fixed) err('Chưa nhập giá trị cố định.');
      if (cfg.mode === 'generator' && cfg.generator === 'number' && Number(cfg.numMin) > Number(cfg.numMax)) err('Khoảng số không hợp lệ.');
      if (q.hasValidation && cfg.mode === 'generator') warn('Câu này có điều kiện kiểm tra câu trả lời: hãy chắc chắn kiểu sinh phù hợp.');
      checkList(cfg, q);
    } else if (q.type === 'date') {
      if (cfg.mode === 'random') {
        const a = gen.parseDate(cfg.rangeStart);
        const b = gen.parseDate(cfg.rangeEnd);
        if (!a || !b) err('Khoảng ngày không hợp lệ.');
      }
      if (cfg.mode === 'fixed' && cfg.fixed && !gen.parseDate(cfg.fixed)) err('Ngày cố định không hợp lệ.');
      if (cfg.mode === 'fixed' && q.required && !cfg.fixed) err('Chưa nhập ngày cố định.');
      checkList(cfg, q);
    } else if (q.type === 'time') {
      if (cfg.mode === 'random' && (!gen.parseTime(cfg.timeStart) || !gen.parseTime(cfg.timeEnd))) err('Khoảng giờ không hợp lệ.');
      if (cfg.mode === 'fixed' && q.required && !cfg.fixed) err('Chưa nhập giờ cố định.');
      checkList(cfg, q);
    }
    return issues;
  }

  // All issues: [{ key, title, level, msg }].
  function validate(model, stored, csv, run) {
    const out = [];
    for (const q of model.questions) {
      for (const i of validateQuestion(q, getConfig(q, stored), csv, run)) out.push({ key: q.key, title: q.title, ...i });
    }
    const count = Number(run && run.count);
    if (!(count >= 1)) out.push({ key: '', title: 'Cài đặt chạy', level: 'error', msg: 'Số lần gửi phải ≥ 1.' });
    if (run && Number(run.delayMin) > Number(run.delayMax)) out.push({ key: '', title: 'Cài đặt chạy', level: 'error', msg: 'Delay tối thiểu lớn hơn tối đa.' });
    return out;
  }

  GFF.payload = {
    OTHER, isChoice, isText, defaultConfig, getConfig, gridRowQuestion, gridRowConfig, splitLines,
    makeContext, listValues, listValue, matchOption, answerChoice, answerCheckbox, answerText, answerDate,
    answerTime, buildSubmission, buildBody, looksSubmitted, sumWeights, validateQuestion, validate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GFF.payload;
})(typeof globalThis !== 'undefined' ? globalThis : this);
