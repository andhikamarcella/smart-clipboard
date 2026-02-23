const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems',
  THEME: 'theme'
};

const MAX_ITEMS = 50;

const EMAIL_TEMPLATES = {
  paymentReminder:
    'Subject: Friendly Payment Reminder\n\nHello [Name],\n\nThis is a reminder that invoice [Invoice #] is due on [Date]. Kindly confirm once paid.\n\nBest regards,\n[Your Name]',
  interviewInvitation:
    'Subject: Interview Invitation\n\nHi [Candidate Name],\n\nWe would like to invite you for an interview for the [Role] position on [Date/Time]. Please confirm your availability.\n\nRegards,\n[Hiring Team]',
  orderConfirmation:
    'Subject: Order Confirmation\n\nHello [Customer Name],\n\nThank you for your order #[Order ID]. We have confirmed your order and started processing it.\n\nBest,\n[Support Team]'
};

const state = {
  clipboardItems: [],
  search: '',
  activeTab: 'clipboard'
};

const el = {};
let storageListener = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('[SAC][POPUP] init');
  mapElements();
  bindEvents();
  bindAdminTools();
  bindShortcuts();
  bindStorageSync();

  await hydrateTheme();
  await loadClipboardHistory();

  renderClipboard();
  renderTemplates();
  updateCalculator();
}

window.addEventListener('unload', () => {
  if (storageListener) chrome.storage.onChanged.removeListener(storageListener);
});

function mapElements() {
  Object.assign(el, {
    tabs: Array.from(document.querySelectorAll('.tab-btn')),
    panels: {
      clipboard: document.getElementById('clipboardPanel'),
      admin: document.getElementById('adminPanel')
    },
    themeToggle: document.getElementById('themeToggle'),
    searchInput: document.getElementById('searchInput'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importInput: document.getElementById('importInput'),
    testReadClipboardBtn: document.getElementById('testReadClipboardBtn'),
    clipboardReadResult: document.getElementById('clipboardReadResult'),
    clipboardList: document.getElementById('clipboardList'),
    emptyState: document.getElementById('emptyState'),
    priceInput: document.getElementById('priceInput'),
    discountInput: document.getElementById('discountInput'),
    taxInput: document.getElementById('taxInput'),
    calcResult: document.getElementById('calcResult'),
    invoiceOutput: document.getElementById('invoiceOutput'),
    generateInvoiceBtn: document.getElementById('generateInvoiceBtn'),
    copyInvoiceBtn: document.getElementById('copyInvoiceBtn'),
    templateButtons: document.getElementById('templateButtons'),
    templatePreview: document.getElementById('templatePreview'),
    copyTemplateBtn: document.getElementById('copyTemplateBtn'),
    toastContainer: document.getElementById('toastContainer')
  });
}

function bindEvents() {
  el.tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

  el.themeToggle.addEventListener('click', toggleTheme);

  el.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.toLowerCase().trim();
    renderClipboard();
  });

  el.clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Clear all clipboard items?')) return;
    state.clipboardItems = [];
    await persistClipboardItems();
    renderClipboard();
    toast('Clipboard history cleared', 'success');
  });

  el.exportBtn.addEventListener('click', exportClipboardJson);
  el.importInput.addEventListener('change', importClipboardJson);

  el.testReadClipboardBtn.addEventListener('click', onManualClipboardRead);
}

function bindAdminTools() {
  [el.priceInput, el.discountInput, el.taxInput].forEach((input) => input.addEventListener('input', updateCalculator));

  el.generateInvoiceBtn.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GENERATE_INVOICE' });
    if (!response?.ok) {
      toast(response?.error || 'Failed to generate invoice', 'error');
      return;
    }

    el.invoiceOutput.value = response.data;
    toast('Invoice generated', 'success');
  });

  el.copyInvoiceBtn.addEventListener('click', async () => {
    if (!el.invoiceOutput.value) {
      toast('Generate invoice first', 'error');
      return;
    }

    await copyToClipboard(el.invoiceOutput.value, 'Invoice copied');
  });

  el.copyTemplateBtn.addEventListener('click', async () => {
    const text = el.templatePreview.value.trim();
    if (!text) {
      toast('Template is empty', 'error');
      return;
    }
    await copyToClipboard(text, 'Template copied');
  });
}

function bindShortcuts() {
  document.addEventListener('keydown', async (event) => {
    const cmdOrCtrl = event.ctrlKey || event.metaKey;

    if (cmdOrCtrl && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      switchTab('clipboard');
      el.searchInput.focus();
      el.searchInput.select();
    }

    if (cmdOrCtrl && event.key === '1') {
      event.preventDefault();
      switchTab('clipboard');
    }

    if (cmdOrCtrl && event.key === '2') {
      event.preventDefault();
      switchTab('admin');
    }

    if (!cmdOrCtrl && event.key.toLowerCase() === 't') {
      toggleTheme();
    }

    if (cmdOrCtrl && event.shiftKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      await onManualClipboardRead();
    }
  });
}

function bindStorageSync() {
  storageListener = (changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes[STORAGE_KEYS.CLIPBOARD_ITEMS]) return;

    const oldValue = Array.isArray(changes[STORAGE_KEYS.CLIPBOARD_ITEMS].oldValue)
      ? changes[STORAGE_KEYS.CLIPBOARD_ITEMS].oldValue
      : [];
    const newValue = Array.isArray(changes[STORAGE_KEYS.CLIPBOARD_ITEMS].newValue)
      ? changes[STORAGE_KEYS.CLIPBOARD_ITEMS].newValue
      : [];

    console.log('[SAC][POPUP] storage update detected old/new:', oldValue.length, newValue.length);
    state.clipboardItems = newValue;
    renderClipboard();

    if (newValue.length > oldValue.length) {
      toast('Clipboard item saved', 'success');
    }
  };

  chrome.storage.onChanged.addListener(storageListener);
}

function switchTab(tabName) {
  state.activeTab = tabName;

  Object.entries(el.panels).forEach(([name, panel]) => {
    panel.classList.toggle('active', name === tabName);
  });

  el.tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

async function hydrateTheme() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.THEME);
  const theme = result[STORAGE_KEYS.THEME] || 'light';
  applyTheme(theme);
}

async function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: next });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

async function loadClipboardHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CLIPBOARD_HISTORY' });
    if (response?.ok && Array.isArray(response.data)) {
      state.clipboardItems = response.data;
      console.log('[SAC][POPUP] loaded from background:', state.clipboardItems.length);
      return;
    }
  } catch (error) {
    console.warn('[SAC][POPUP] background history fetch failed:', error);
  }

  try {
    const fallback = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_ITEMS);
    state.clipboardItems = Array.isArray(fallback[STORAGE_KEYS.CLIPBOARD_ITEMS])
      ? fallback[STORAGE_KEYS.CLIPBOARD_ITEMS]
      : [];
    console.log('[SAC][POPUP] loaded from storage fallback:', state.clipboardItems.length);
  } catch (error) {
    console.error('[SAC][POPUP] fallback storage load failed:', error);
    state.clipboardItems = [];
  }
}

async function onManualClipboardRead() {
  try {
    const raw = await navigator.clipboard.readText();
    const text = sanitizeText(raw);

    el.clipboardReadResult.textContent = `Last read: ${text || '(empty)'}`;
    console.log('[SAC][POPUP] manual read text:', text);

    if (!text || text.length < 2) {
      toast('Clipboard empty or too short (<2 chars)', 'error');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_CLIPBOARD',
      payload: {
        text,
        source: 'popup_manual'
      }
    });

    if (!response?.ok) {
      toast(response?.error || 'Failed to save clipboard', 'error');
      return;
    }

    if (response.data?.saved) {
      toast('Manual clipboard read saved', 'success');
    } else {
      toast(`Manual read skipped: ${response.data?.reason || 'not saved'}`, 'error');
    }
  } catch (error) {
    console.error('[SAC][POPUP] manual clipboard read failed:', error);
    el.clipboardReadResult.textContent = `Last read: Error (${error.message})`;
    toast('Clipboard read blocked. Grant clipboard permissions.', 'error');
  }
}

async function persistClipboardItems() {
  const pinned = state.clipboardItems.filter((item) => item.pinned);
  const unpinned = state.clipboardItems.filter((item) => !item.pinned);
  state.clipboardItems = [...pinned, ...unpinned].slice(0, MAX_ITEMS);

  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: state.clipboardItems });
}

function renderClipboard() {
  const filtered = state.clipboardItems.filter((item) => item.text.toLowerCase().includes(state.search));
  el.clipboardList.innerHTML = '';

  if (!filtered.length) {
    el.emptyState.classList.remove('hidden');
    return;
  }

  el.emptyState.classList.add('hidden');

  filtered.forEach((item) => {
    const node = document.createElement('article');
    node.className = `item ${item.pinned ? 'pinned' : ''}`;
    node.innerHTML = `
      <p class="item-text"></p>
      <div class="item-meta">
        <span>${item.pinned ? '📌 Pinned' : '📄 Clipboard'}${item.source ? ` • ${item.source}` : ''}</span>
        <time>${formatTime(item.createdAt)}</time>
      </div>
      <div class="item-actions">
        <button data-action="copy">Copy</button>
        <button data-action="pin" class="ghost-btn">${item.pinned ? 'Unpin' : 'Pin'}</button>
        <button data-action="delete" class="ghost-btn">Delete</button>
      </div>
    `;

    node.querySelector('.item-text').textContent = truncate(item.text, 180);

    node.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      await copyToClipboard(item.text, 'Copied to clipboard');
    });

    node.querySelector('[data-action="pin"]').addEventListener('click', async () => {
      item.pinned = !item.pinned;
      await persistClipboardItems();
      renderClipboard();
      toast(item.pinned ? 'Item pinned' : 'Item unpinned', 'success');
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      state.clipboardItems = state.clipboardItems.filter((entry) => entry.id !== item.id);
      await persistClipboardItems();
      renderClipboard();
      toast('Item deleted', 'success');
    });

    el.clipboardList.appendChild(node);
  });
}

function renderTemplates() {
  const labels = {
    paymentReminder: 'Payment Reminder',
    interviewInvitation: 'Interview Invitation',
    orderConfirmation: 'Order Confirmation'
  };

  Object.entries(labels).forEach(([key, label]) => {
    const button = document.createElement('button');
    button.className = 'ghost-btn';
    button.textContent = label;
    button.addEventListener('click', () => {
      el.templatePreview.value = EMAIL_TEMPLATES[key];
      toast(`${label} loaded`, 'success');
    });
    el.templateButtons.appendChild(button);
  });

  el.templatePreview.value = EMAIL_TEMPLATES.paymentReminder;
}

function updateCalculator() {
  const price = parseNumber(el.priceInput.value, { min: 0 });
  const discount = parseNumber(el.discountInput.value, { min: 0, max: 100 });
  const tax = parseNumber(el.taxInput.value, { min: 0, max: 100 });

  if ([price, discount, tax].includes(null)) {
    el.calcResult.textContent = 'Final Total: Invalid input';
    el.calcResult.style.color = 'var(--danger)';
    return;
  }

  const discounted = price * (1 - discount / 100);
  const total = discounted * (1 + tax / 100);
  el.calcResult.textContent = `Final Total: $${total.toFixed(2)}`;
  el.calcResult.style.color = 'var(--success)';
}

function exportClipboardJson() {
  const blob = new Blob([JSON.stringify(state.clipboardItems, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'smart-admin-clipboard-history.json';
  a.click();

  URL.revokeObjectURL(url);
  toast('Clipboard exported', 'success');
}

async function importClipboardJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) throw new Error('JSON must be an array');

    const validated = parsed
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : `clip_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        text: sanitizeText(item.text),
        pinned: Boolean(item.pinned),
        createdAt: Number(item.createdAt) || Date.now(),
        source: typeof item.source === 'string' ? item.source : 'imported'
      }))
      .filter((item) => item.text && item.text.length >= 2)
      .slice(0, MAX_ITEMS);

    state.clipboardItems = validated;
    await persistClipboardItems();
    renderClipboard();
    toast('Clipboard imported', 'success');
  } catch (error) {
    toast(`Import failed: ${error.message}`, 'error');
  } finally {
    event.target.value = '';
  }
}

function parseNumber(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'Unknown time';

  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function copyToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, 'success');
  } catch (_error) {
    toast('Copy failed. Check clipboard permissions.', 'error');
  }
}

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  el.toastContainer.appendChild(node);

  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 180);
  }, 2200);
}
