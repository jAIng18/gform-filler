// Service worker: opens the side panel from the toolbar icon, fires scheduled runs, shows notifications.
'use strict';

const CONTENT_FILES = ['lib/generators.js', 'lib/parser.js', 'lib/csv.js', 'lib/payload.js', 'content.js'];

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message });
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab không tải xong kịp.'));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') listener(tabId, { status: 'complete' });
    });
  });
}

async function sendWhenReady(tabId, message) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'gff:ping' });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      if (attempt === 3) {
        await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Không kết nối được với trang form.');
}

async function runSchedule(id) {
  const { schedules = {} } = await chrome.storage.local.get('schedules');
  const s = schedules[id];
  if (!s) return;
  delete schedules[id];
  await chrome.storage.local.set({ schedules });
  try {
    const tab = await chrome.tabs.create({ url: s.formUrl, active: true });
    await waitForTabComplete(tab.id, 60000);
    const res = await sendWhenReady(tab.id, { type: 'gff:start', payload: { ...s.payload, notify: true } });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Không bắt đầu được.');
    notify('GForm Filler: bắt đầu chạy lịch', `${s.formTitle}: ${s.payload.run.count} lần gửi.`);
  } catch (e) {
    notify('GForm Filler: lịch chạy lỗi', `${s.formTitle}: ${e.message}`);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('gff:')) runSchedule(alarm.name.slice(4));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'gff:runDone' && msg.notify) {
    notify(`GForm Filler: xong "${msg.title}"`, msg.summary);
  }
});
