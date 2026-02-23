// Smart Admin Clipboard - MV3 Service Worker
// Central source of truth for clipboard storage and validation.

const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems',
  INVOICE_COUNTERS: 'invoiceCounters',
  THEME: 'theme'
};

const MAX_ITEMS = 50;
const MIN_TEXT_LENGTH = 2;

self.addEventListener('activate', () => {
  console.log('[SAC][BG] Service worker activated');
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SAC][BG] onInstalled:', details.reason);
  await ensureDefaults();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[SAC][BG] onStartup');
  await ensureDefaults();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SAC][BG] onMessage received:', message?.type, 'from', sender?.url || 'extension');

  if (!message || typeof message.type !== 'string') {
    sendResponse({ ok: false, error: 'Invalid message shape.' });
    return false;
  }

  if (message.type === 'SAVE_CLIPBOARD') {
    (async () => {
      try {
        const result = await saveClipboardItem(message.payload?.text, message.payload?.source || 'content');
        sendResponse({ ok: true, data: result });
      } catch (error) {
        console.error('[SAC][BG] SAVE_CLIPBOARD failed:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to save clipboard item.' });
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
        console.error('[SAC][BG] GET_CLIPBOARD_HISTORY failed:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to fetch clipboard history.' });
      }
    })();
    return true;
  }

  if (message.type === 'GENERATE_INVOICE') {
    (async () => {
      try {
        const invoice = await generateInvoiceNumber();
        sendResponse({ ok: true, data: invoice });
      } catch (error) {
        console.error('[SAC][BG] GENERATE_INVOICE failed:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to generate invoice.' });
      }
    })();
    return true;
  }

  sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
  return false;
});

async function ensureDefaults() {
  try {
    const current = await chrome.storage.local.get([
      STORAGE_KEYS.CLIPBOARD_ITEMS,
      STORAGE_KEYS.INVOICE_COUNTERS,
      STORAGE_KEYS.THEME
    ]);

    const defaults = {};

    if (!Array.isArray(current[STORAGE_KEYS.CLIPBOARD_ITEMS])) {
      defaults[STORAGE_KEYS.CLIPBOARD_ITEMS] = [];
    }

    if (!current[STORAGE_KEYS.INVOICE_COUNTERS] || typeof current[STORAGE_KEYS.INVOICE_COUNTERS] !== 'object') {
      defaults[STORAGE_KEYS.INVOICE_COUNTERS] = {};
    }

    if (typeof current[STORAGE_KEYS.THEME] !== 'string') {
      defaults[STORAGE_KEYS.THEME] = 'light';
    }

    if (Object.keys(defaults).length) {
      await chrome.storage.local.set(defaults);
      console.log('[SAC][BG] Defaults initialized:', defaults);
    }
  } catch (error) {
    console.error('[SAC][BG] ensureDefaults error:', error);
  }
}

async function getClipboardItems() {
  await ensureDefaults();

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_ITEMS);
    const items = result[STORAGE_KEYS.CLIPBOARD_ITEMS];
    const normalized = Array.isArray(items) ? items : [];
    console.log('[SAC][BG] Loaded clipboard items:', normalized.length);
    return normalized;
  } catch (error) {
    console.error('[SAC][BG] getClipboardItems storage error:', error);
    throw new Error('Could not read storage.');
  }
}

async function saveClipboardItem(rawText, source = 'unknown') {
  await ensureDefaults();

  const text = sanitizeText(rawText);

  if (!text) {
    console.log('[SAC][BG] Skipped save (empty text) from', source);
    return { saved: false, reason: 'empty' };
  }

  if (text.length < MIN_TEXT_LENGTH) {
    console.log('[SAC][BG] Skipped save (too short) from', source, 'text:', text);
    return { saved: false, reason: 'too_short' };
  }

  const existing = await getClipboardItems();

  if (existing[0] && existing[0].text === text) {
    console.log('[SAC][BG] Skipped save (duplicate consecutive) from', source);
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

  const merged = [item, ...existing];
  const pinned = merged.filter((entry) => entry?.pinned);
  const unpinned = merged.filter((entry) => !entry?.pinned);
  const finalList = [...pinned, ...unpinned].slice(0, MAX_ITEMS);

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: finalList });
    console.log('[SAC][BG] Storage updated. Total items:', finalList.length);
    return { saved: true, item };
  } catch (error) {
    console.error('[SAC][BG] saveClipboardItem storage write error:', error);
    throw new Error('Could not write storage.');
  }
}

async function generateInvoiceNumber() {
  await ensureDefaults();

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.INVOICE_COUNTERS);
    const counters = result[STORAGE_KEYS.INVOICE_COUNTERS] || {};

    const dateKey = formatDateKey(new Date());
    counters[dateKey] = Number(counters[dateKey] || 0) + 1;

    await chrome.storage.local.set({ [STORAGE_KEYS.INVOICE_COUNTERS]: counters });

    const invoice = `INV-${dateKey}-${String(counters[dateKey]).padStart(3, '0')}`;
    console.log('[SAC][BG] Invoice generated:', invoice);
    return invoice;
  } catch (error) {
    console.error('[SAC][BG] generateInvoiceNumber error:', error);
    throw new Error('Invoice generation failed.');
  }
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

function formatDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}
