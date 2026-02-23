// Smart Admin Clipboard - Service Worker (Manifest V3)
// Centralized storage logic keeps popup and content script simple.

const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems',
  INVOICE_COUNTERS: 'invoiceCounters',
  THEME: 'theme'
};

const MAX_CLIPBOARD_ITEMS = 50;

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.CLIPBOARD_ITEMS,
    STORAGE_KEYS.INVOICE_COUNTERS,
    STORAGE_KEYS.THEME
  ]);

  const defaults = {};
  if (!Array.isArray(existing[STORAGE_KEYS.CLIPBOARD_ITEMS])) {
    defaults[STORAGE_KEYS.CLIPBOARD_ITEMS] = [];
  }
  if (!existing[STORAGE_KEYS.INVOICE_COUNTERS]) {
    defaults[STORAGE_KEYS.INVOICE_COUNTERS] = {};
  }
  if (!existing[STORAGE_KEYS.THEME]) {
    defaults[STORAGE_KEYS.THEME] = 'light';
  }

  if (Object.keys(defaults).length) {
    await chrome.storage.local.set(defaults);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SAVE_CLIPBOARD') {
    saveClipboardText(message.payload)
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'GENERATE_INVOICE') {
    generateInvoiceNumber()
      .then((invoiceNumber) => sendResponse({ ok: true, data: invoiceNumber }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function saveClipboardText(payload) {
  const text = sanitizeText(payload?.text);
  if (!text) {
    throw new Error('Clipboard text is empty.');
  }

  const now = Date.now();
  const { [STORAGE_KEYS.CLIPBOARD_ITEMS]: clipboardItems = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.CLIPBOARD_ITEMS
  );

  // Remove duplicate content so latest copy remains most recent.
  const deduped = clipboardItems.filter((item) => item.text !== text);
  const nextItem = {
    id: `clip_${now}_${Math.random().toString(16).slice(2, 8)}`,
    text,
    pinned: false,
    createdAt: now
  };

  const nextList = [nextItem, ...deduped];
  const pinned = nextList.filter((item) => item.pinned);
  const unpinned = nextList.filter((item) => !item.pinned);
  const trimmed = [...pinned, ...unpinned].slice(0, MAX_CLIPBOARD_ITEMS);

  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: trimmed });
  return nextItem;
}

async function generateInvoiceNumber() {
  const { [STORAGE_KEYS.INVOICE_COUNTERS]: invoiceCounters = {} } = await chrome.storage.local.get(
    STORAGE_KEYS.INVOICE_COUNTERS
  );

  const today = formatDateKey(new Date()); // YYYYMMDD
  const todayCount = Number(invoiceCounters[today] || 0) + 1;
  invoiceCounters[today] = todayCount;

  await chrome.storage.local.set({ [STORAGE_KEYS.INVOICE_COUNTERS]: invoiceCounters });

  return `INV-${today}-${String(todayCount).padStart(3, '0')}`;
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
