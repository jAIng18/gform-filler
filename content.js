// Runs inside the Google Form page: reads the form and performs the submissions (same-origin POST).
(function () {
  'use strict';
  if (window.__GFF_CONTENT__) return;
  window.__GFF_CONTENT__ = true;

  const { gen, parser, payload } = globalThis.GFF;
  const MAX_LOG = 200;
  const MAX_CONSECUTIVE_FAILS = 3;

  let model = null;
  let modelError = null;

  const state = {
    running: false,
    paused: false,
    stopRequested: false,
    total: 0,
    done: 0,
    ok: 0,
    fail: 0,
    log: [],
    startedAt: null,
    finishedAt: null,
    stopReason: '',
    nextAt: null,
  };

  function loadModel() {
    model = null;
    modelError = null;
    try {
      let data = null;
      for (const s of document.scripts) {
        if (s.textContent.includes('FB_PUBLIC_LOAD_DATA_')) {
          data = parser.extractFromScriptText(s.textContent);
          break;
        }
      }
      if (!data) {
        modelError = /\/edit/.test(location.pathname)
          ? 'Đây là trang chỉnh sửa. Hãy mở link xem trước / link gửi form (…/viewform).'
          : 'Không tìm thấy dữ liệu form trên trang này.';
        return;
      }
      const m = parser.parseLoadData(data);
      const formEl = document.querySelector('form[action*="formResponse"]');
      m.actionUrl = formEl ? formEl.action : location.href.replace(/\/viewform.*$/, '/formResponse');
      const fbzx = document.querySelector('input[name="fbzx"]');
      m.fbzx = fbzx ? fbzx.value : null;
      m.formKey = parser.formKeyFromUrl(location.href);
      m.url = location.href.split('#')[0];
      model = m;
    } catch (e) {
      modelError = 'Lỗi đọc form: ' + e.message;
    }
  }

  function snapshot() {
    return { ...state, log: state.log.slice(-MAX_LOG) };
  }

  function emit(extra) {
    chrome.runtime
      .sendMessage({ type: 'gff:progress', formKey: model && model.formKey, state: snapshot(), ...extra })
      .catch(() => {});
  }

  function addLog(entry) {
    state.log.push({ at: Date.now(), ...entry });
    if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
  }

  // Sleeps in small steps so Stop/Pause react quickly.
  async function wait(ms) {
    const end = Date.now() + ms;
    state.nextAt = end;
    while (Date.now() < end) {
      if (state.stopRequested) break;
      await new Promise((r) => setTimeout(r, Math.min(200, end - Date.now())));
    }
    state.nextAt = null;
  }

  async function waitWhilePaused() {
    while (state.paused && !state.stopRequested) await new Promise((r) => setTimeout(r, 200));
  }

  async function submitOnce(body) {
    const res = await fetch(model.actionUrl, {
      method: 'POST',
      body,
      credentials: 'include',
      redirect: 'follow',
    });
    const html = await res.text();
    if (!res.ok) {
      console.warn('[GFF] HTTP', res.status, res.url, '\nsent:', body.toString(), '\nresponse:', html);
      return { ok: false, status: res.status, msg: `HTTP ${res.status}` };
    }
    if (!payload.looksSubmitted(html)) {
      console.warn('[GFF] form returned', res.url, '\nsent:', body.toString(), '\nresponse:', html);
      return { ok: false, status: res.status, msg: 'Google trả lại form. ' + describeReturnedPage(res.url, html) };
    }
    return { ok: true, status: res.status, msg: 'Đã gửi' };
  }

  // Diagnostics for a returned form: which page Google sent back and any validation messages on it.
  function describeReturnedPage(url, html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const form = doc.querySelector('form[action*="formResponse"]');
    const parts = [`[url: ${url.replace(/^https:\/\/docs\.google\.com/, '')}]`];
    if (/accounts\.google\.com/.test(url)) parts.push('[bị chuyển sang trang đăng nhập]');
    if (form) {
      const d = form.dataset;
      parts.push(`[trang trả về: firstEntry=${d.firstEntry} lastEntry=${d.lastEntry} isFirstPage=${d.isFirstPage}]`);
    }
    const alerts = Array.from(doc.querySelectorAll('[role="alert"]'))
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    if (alerts.length) parts.push(`[lỗi: ${Array.from(new Set(alerts)).slice(0, 3).join(' | ')}]`);
    const title = doc.title && doc.title.trim();
    if (title) parts.push(`[title: ${title}]`);
    return parts.join(' ');
  }

  async function run(p) {
    const run = p.run || {};
    const count = Math.max(1, Math.floor(Number(run.count) || 1));
    const startRow = Math.max(1, Math.floor(Number(run.startRow) || 1));
    const delayMin = Math.max(0, Number(run.delayMin) || 0);
    const delayMax = Math.max(delayMin, Number(run.delayMax) || 0);
    const rng = gen.createRng(gen.randomSeed());

    Object.assign(state, {
      running: true, paused: false, stopRequested: false, total: count, done: 0, ok: 0, fail: 0,
      log: [], startedAt: Date.now(), finishedAt: null, stopReason: '', nextAt: null,
    });
    emit();

    let consecutiveFails = 0;
    for (let i = 0; i < count; i++) {
      await waitWhilePaused();
      if (state.stopRequested) {
        state.stopReason = 'Đã dừng theo yêu cầu.';
        break;
      }
      const ctx = payload.makeContext(rng, startRow - 1 + i, p.csv);
      const { fields, preview } = payload.buildSubmission(model, p.config || {}, ctx);
      let result;
      try {
        result = await submitOnce(payload.buildBody(model, fields, model.fbzx));
      } catch (e) {
        result = { ok: false, status: 0, msg: 'Lỗi mạng: ' + e.message };
      }
      state.done++;
      if (result.ok) {
        state.ok++;
        consecutiveFails = 0;
      } else {
        state.fail++;
        consecutiveFails++;
      }
      addLog({ n: startRow + i, ok: result.ok, msg: result.msg, preview: preview.slice(0, 4).map((x) => x.value).join(' · ') });
      emit();
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        state.stopReason = `Tự dừng sau ${MAX_CONSECUTIVE_FAILS} lần lỗi liên tiếp.`;
        break;
      }
      if (i < count - 1) {
        const delay = delayMin + rng() * (delayMax - delayMin);
        await wait(delay * 1000);
      }
    }
    if (!state.stopReason) state.stopReason = 'Hoàn thành.';
    state.running = false;
    state.paused = false;
    state.finishedAt = Date.now();
    emit();
    chrome.runtime
      .sendMessage({
        type: 'gff:runDone',
        notify: !!p.notify,
        title: model.title,
        summary: `${state.ok}/${state.total} thành công, ${state.fail} lỗi. ${state.stopReason}`,
      })
      .catch(() => {});
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('gff:')) return;
    switch (msg.type) {
      case 'gff:ping':
        sendResponse({ ready: true });
        break;
      case 'gff:getForm':
        if (!model || msg.reload) loadModel();
        sendResponse({ model, error: modelError, state: snapshot() });
        break;
      case 'gff:status':
        sendResponse({ state: snapshot() });
        break;
      case 'gff:start':
        if (!model) loadModel();
        if (!model) {
          sendResponse({ ok: false, error: modelError });
        } else if (state.running) {
          sendResponse({ ok: false, error: 'Đang chạy rồi.' });
        } else {
          run(msg.payload || {});
          sendResponse({ ok: true });
        }
        break;
      case 'gff:pause':
        state.paused = true;
        emit();
        sendResponse({ ok: true });
        break;
      case 'gff:resume':
        state.paused = false;
        emit();
        sendResponse({ ok: true });
        break;
      case 'gff:stop':
        state.stopRequested = true;
        state.paused = false;
        emit();
        sendResponse({ ok: true });
        break;
      default:
        break;
    }
  });

  loadModel();
})();
