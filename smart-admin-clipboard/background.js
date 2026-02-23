// Smart Admin Clipboard - Manifest V3 Service Worker
// Handles clipboard persistence, dedupe rules, and popup-facing data APIs.

const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems',
  INVOICE_COUNTERS: 'invoiceCounters',
  THEME: 'theme'
};

const MAX_CLIPBOARD_ITEMS = 50;

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
  if (!message || typeof message.type !== 'string') {
    sendResponse({ ok: false, error: 'Invalid message format.' });
    return false;
  }

  console.log('[SAC][BG] Message received:', message.type, 'from', sender?.url || 'extension');

  if (message.type === 'SAVE_CLIPBOARD') {
    (async () => {
      try {
        const saved = await saveClipboardText(message.payload?.text);
        sendResponse({ ok: true, data: saved });
      } catch (error) {
        console.error('[SAC][BG] SAVE_CLIPBOARD error:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to save clipboard text.' });
      }
    })();

    // Required for async sendResponse in MV3.
    return true;
  }

  if (message.type === 'GET_CLIPBOARD_HISTORY') {
    (async () => {
      try {
        const items = await getClipboardItems();
        sendResponse({ ok: true, data: items });
      } catch (error) {
        console.error('[SAC][BG] GET_CLIPBOARD_HISTORY error:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to load clipboard history.' });
      }
    })();

    return true;
  }

  if (message.type === 'GENERATE_INVOICE') {
    (async () => {
      try {
        const invoiceNumber = await generateInvoiceNumber();
        sendResponse({ ok: true, data: invoiceNumber });
      } catch (error) {
        console.error('[SAC][BG] GENERATE_INVOICE error:', error);
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
    const existing = await chrome.storage.local.get([
      STORAGE_KEYS.CLIPBOARD_ITEMS,
      STORAGE_KEYS.INVOICE_COUNTERS,
      STORAGE_KEYS.THEME
    ]);

    const defaults = {};

    if (!Array.isArray(existing[STORAGE_KEYS.CLIPBOARD_ITEMS])) {
      defaults[STORAGE_KEYS.CLIPBOARD_ITEMS] = [];
    }

    if (!existing[STORAGE_KEYS.INVOICE_COUNTERS] || typeof existing[STORAGE_KEYS.INVOICE_COUNTERS] !== 'object') {
      defaults[STORAGE_KEYS.INVOICE_COUNTERS] = {};
    }

    if (typeof existing[STORAGE_KEYS.THEME] !== 'string') {
      defaults[STORAGE_KEYS.THEME] = 'light';
    }

    if (Object.keys(defaults).length > 0) {
      await chrome.storage.local.set(defaults);
      console.log('[SAC][BG] Defaults initialized:', Object.keys(defaults));
    }
  } catch (error) {
    console.error('[SAC][BG] ensureDefaults failed:', error);
  }
}

async function getClipboardItems() {
  await ensureDefaults();

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_ITEMS);
    const items = result[STORAGE_KEYS.CLIPBOARD_ITEMS];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('[SAC][BG] getClipboardItems storage error:', error);
    throw new Error('Storage read failed.');
  }
}

async function saveClipboardText(rawText) {
  await ensureDefaults();

  const text = sanitizeText(rawText);
  if (!text) {
    throw new Error('Empty clipboard text ignored.');
  }

  const items = await getClipboardItems();

  // Prevent duplicate consecutive entries exactly as requested.
  if (items[0] && items[0].text === text) {
    console.log('[SAC][BG] Consecutive duplicate ignored');
    return { skipped: true, reason: 'duplicate_consecutive' };
  }

  const now = Date.now();
  const nextItem = {
    id: `clip_${now}_${Math.random().toString(16).slice(2, 8)}`,
    text,
    pinned: false,
    createdAt: now
  };

  const merged = [nextItem, ...items];
  const pinned = merged.filter((item) => item?.pinned);
  const unpinned = merged.filter((item) => !item?.pinned);
  const trimmed = [...pinned, ...unpinned].slice(0, MAX_CLIPBOARD_ITEMS);

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: trimmed });
    console.log('[SAC][BG] Clipboard item saved. Total:', trimmed.length);
    return { skipped: false, item: nextItem };
  } catch (error) {
    console.error('[SAC][BG] saveClipboardText storage write error:', error);
    throw new Error('Storage write failed.');
  }
}

async function generateInvoiceNumber() {
  await ensureDefaults();

  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.INVOICE_COUNTERS);
    const invoiceCounters = result[STORAGE_KEYS.INVOICE_COUNTERS] || {};

    const today = formatDateKey(new Date());
    const nextCounter = Number(invoiceCounters[today] || 0) + 1;
    invoiceCounters[today] = nextCounter;

    await chrome.storage.local.set({ [STORAGE_KEYS.INVOICE_COUNTERS]: invoiceCounters });

    const invoice = `INV-${today}-${String(nextCounter).padStart(3, '0')}`;
    console.log('[SAC][BG] Invoice generated:', invoice);
    return invoice;
  } catch (error) {
    console.error('[SAC][BG] generateInvoiceNumber storage error:', error);
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
