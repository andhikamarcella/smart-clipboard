const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems',
  INVOICE_COUNTERS: 'invoiceCounters',
  THEME: 'theme'
};

const MAX_ITEMS = 50;
const MIN_LENGTH = 2;

self.addEventListener('activate', () => {
  console.log('[SAC][BG] Service worker activated');
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[SAC][BG] onInstalled');
  await ensureDefaults();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[SAC][BG] onStartup');
  await ensureDefaults();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SAC][BG] message received:', message?.type, 'from', sender?.url || 'extension');

  if (!message || typeof message.type !== 'string') {
    sendResponse({ ok: false, error: 'Invalid message.' });
    return false;
  }

  if (message.type === 'PING_CONTENT') {
    sendResponse({ ok: true, data: { connected: true } });
    return false;
  }

  if (message.type === 'SAVE_CLIPBOARD') {
    (async () => {
      try {
        const result = await saveClipboardItem(message.payload?.text, message.payload?.source || 'unknown');
        sendResponse({ ok: true, data: result });
      } catch (error) {
        console.error('[SAC][BG] SAVE_CLIPBOARD error:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to save clipboard.' });
      }
    })();
    return true;
  }

  if (message.type === 'GET_CLIPBOARD_HISTORY') {
    (async () => {
      try {
        const items = await getClipboardItems();
        sendResponse({ ok: true, data: items });
      } catch (error) {
        console.error('[SAC][BG] GET_CLIPBOARD_HISTORY error:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to get history.' });
      }
    })();
    return true;
  }

  sendResponse({ ok: false, error: `Unknown type: ${message.type}` });
  return false;
});

async function ensureDefaults() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.CLIPBOARD_ITEMS,
      STORAGE_KEYS.INVOICE_COUNTERS,
      STORAGE_KEYS.THEME
    ]);

    const defaults = {};
    if (!Array.isArray(result[STORAGE_KEYS.CLIPBOARD_ITEMS])) defaults[STORAGE_KEYS.CLIPBOARD_ITEMS] = [];
    if (!result[STORAGE_KEYS.INVOICE_COUNTERS] || typeof result[STORAGE_KEYS.INVOICE_COUNTERS] !== 'object') {
      defaults[STORAGE_KEYS.INVOICE_COUNTERS] = {};
    }
    if (typeof result[STORAGE_KEYS.THEME] !== 'string') defaults[STORAGE_KEYS.THEME] = 'light';

    if (Object.keys(defaults).length > 0) {
      await chrome.storage.local.set(defaults);
      console.log('[SAC][BG] defaults initialized');
    }
  } catch (error) {
    console.error('[SAC][BG] ensureDefaults failed:', error);
  }
}

async function getClipboardItems() {
  await ensureDefaults();

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_ITEMS);
    const items = Array.isArray(result[STORAGE_KEYS.CLIPBOARD_ITEMS]) ? result[STORAGE_KEYS.CLIPBOARD_ITEMS] : [];
    return items;
  } catch (error) {
    console.error('[SAC][BG] getClipboardItems failed:', error);
    throw new Error('Storage read failed.');
  }
}

async function saveClipboardItem(rawText, source) {
  const text = sanitize(rawText);

  if (!text) {
    return { saved: false, reason: 'empty' };
  }

  if (text.length < MIN_LENGTH) {
    return { saved: false, reason: 'too_short' };
  }

  const current = await getClipboardItems();

  if (current[0] && current[0].text === text) {
    return { saved: false, reason: 'duplicate_consecutive' };
  }

  const now = Date.now();
  const item = {
    id: `clip_${now}_${Math.random().toString(16).slice(2, 8)}`,
    text,
    pinned: false,
    createdAt: now,
    source
  };

  const next = [item, ...current].slice(0, MAX_ITEMS);

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: next });
    console.log('[SAC][BG] storage updated, total:', next.length);
    return { saved: true, item };
  } catch (error) {
    console.error('[SAC][BG] save storage failed:', error);
    throw new Error('Storage write failed.');
  }
}

function sanitize(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}
