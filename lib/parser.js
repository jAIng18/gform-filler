// Turns the FB_PUBLIC_LOAD_DATA_ array embedded in a Google Form page into a question model.
(function (root) {
  'use strict';
  const GFF = root.GFF || (root.GFF = {});

  const TYPES = {
    0: 'text', 1: 'paragraph', 2: 'choice', 3: 'dropdown', 4: 'checkbox', 5: 'scale',
    6: 'header', 7: 'grid', 8: 'section', 9: 'date', 10: 'time', 11: 'image', 12: 'video',
    13: 'file', 18: 'rating',
  };
  const DISPLAY_ONLY = new Set(['header', 'image', 'video']);

  // Pulls the JSON array out of the script text `var FB_PUBLIC_LOAD_DATA_ = [...];`.
  function extractFromScriptText(text) {
    const at = text.indexOf('FB_PUBLIC_LOAD_DATA_');
    if (at < 0) return null;
    const start = text.indexOf('[', text.indexOf('=', at));
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1));
  }

  // Same, from a whole HTML document (used by tests and for fetched pages).
  function extractFromHtml(html) {
    const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      if (m[1].includes('FB_PUBLIC_LOAD_DATA_')) return extractFromScriptText(m[1]);
    }
    return null;
  }

  function formKeyFromUrl(url) {
    const m = String(url || '').match(/\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?([^/?#]+)/);
    return m ? m[1] : null;
  }

  function parseLoadData(data) {
    if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error('Không đọc được dữ liệu form.');
    const form = data[1];
    const items = Array.isArray(form[1]) ? form[1] : [];
    const settings = Array.isArray(form[10]) ? form[10] : [];
    const model = {
      title: form[8] || data[3] || 'Google Form',
      description: form[0] || '',
      // settings[6]: 1 = don't collect emails, 2 = verified (from sign-in), 3 = responder types it.
      emailMode: settings[6] || 1,
      pageCount: 1,
      questions: [],
      unsupported: [],
    };

    let page = 0;
    for (const item of items) {
      if (!Array.isArray(item)) continue;
      const [itemId, title, description, typeCode, entries] = item;
      const type = TYPES[typeCode] || 'unknown';
      if (type === 'section') {
        page++;
        continue;
      }
      if (DISPLAY_ONLY.has(type)) continue;

      const q = {
        key: 'q' + itemId,
        itemId,
        title: (title || '').trim() || '(Không có tiêu đề)',
        description: description || '',
        type,
        typeCode,
        page,
        required: false,
        options: [],
        hasOther: false,
      };
      const list = Array.isArray(entries) ? entries : [];

      if (type === 'grid') {
        q.rows = list.map((e) => ({
          entryId: e[0],
          label: (Array.isArray(e[3]) && e[3][0]) || '',
          required: !!e[2],
        }));
        q.options = ((list[0] && list[0][1]) || []).map((o) => ({ label: String(o[0]) }));
        q.gridCheckbox = !!(list[0] && Array.isArray(list[0][11]) && list[0][11][0]);
        q.required = q.rows.some((r) => r.required);
        if (!q.rows.length) continue;
      } else {
        const e = list[0];
        if (!Array.isArray(e) || e[0] == null) {
          if (type === 'unknown') model.unsupported.push(q);
          continue;
        }
        q.entryId = e[0];
        q.required = !!e[2];
        const opts = Array.isArray(e[1]) ? e[1] : [];
        q.options = opts.filter((o) => !o[4]).map((o) => ({ label: String(o[0]) }));
        q.hasOther = opts.some((o) => o[4]);
        q.hasValidation = Array.isArray(e[4]) && e[4].length > 0;
        if (type === 'scale') q.scaleLabels = Array.isArray(e[3]) ? e[3] : [];
        if (type === 'date') {
          const flags = Array.isArray(e[7]) ? e[7] : [];
          q.includeTime = flags[0] === 1;
          q.includeYear = flags.length > 1 ? flags[1] === 1 : true;
        }
        if (type === 'time') q.duration = !!(Array.isArray(e[6]) && e[6][0]);
      }

      if (type === 'unknown') model.unsupported.push(q);
      else model.questions.push(q);
    }
    model.pageCount = page + 1;

    if (model.emailMode === 3) {
      model.questions.unshift({
        key: 'emailAddress',
        field: 'emailAddress',
        title: 'Email người trả lời (form thu thập email)',
        description: '',
        type: 'email',
        page: 0,
        required: true,
        options: [],
        hasOther: false,
      });
    }
    return model;
  }

  GFF.parser = { TYPES, extractFromScriptText, extractFromHtml, formKeyFromUrl, parseLoadData };
  if (typeof module !== 'undefined' && module.exports) module.exports = GFF.parser;
})(typeof globalThis !== 'undefined' ? globalThis : this);
