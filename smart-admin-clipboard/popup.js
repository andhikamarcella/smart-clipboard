const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems',
  THEME: 'theme'
};

const MAX_CLIPBOARD_ITEMS = 50;

const EMAIL_TEMPLATES = {
  paymentReminder:
    'Subject: Friendly Payment Reminder\n\nHello [Name],\n\nThis is a kind reminder that invoice [Invoice #] is due on [Date]. Please confirm once paid.\n\nBest regards,\n[Your Name]',
  interviewInvitation:
    'Subject: Interview Invitation\n\nHi [Candidate Name],\n\nWe would like to invite you for an interview for the [Role] position at [Date/Time]. Please confirm availability.\n\nRegards,\n[Hiring Team]',
  orderConfirmation:
    'Subject: Order Confirmation\n\nHello [Customer Name],\n\nThank you for your order #[Order ID]. Your order has been confirmed and is now being prepared.\n\nBest,\n[Support Team]'
};

const state = {
  clipboardItems: [],
  search: '',
  activeTab: 'clipboard'
};

const el = {};
let storageChangeHandler = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  mapElements();
  bindTabEvents();
  bindBaseEvents();
  bindAdminToolsEvents();
  bindKeyboardShortcuts();
  bindStorageSync();

  await hydrateTheme();
  await loadClipboardItems();

  renderClipboard();
  renderTemplateButtons();
  updateCalculator();
}

window.addEventListener('unload', () => {
  if (storageChangeHandler) {
    chrome.storage.onChanged.removeListener(storageChangeHandler);
  }
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

function bindTabEvents() {
  el.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function bindBaseEvents() {
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
}

function bindAdminToolsEvents() {
  [el.priceInput, el.discountInput, el.taxInput].forEach((input) => {
    input.addEventListener('input', updateCalculator);
  });

  el.generateInvoiceBtn.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GENERATE_INVOICE' });
    if (!response?.ok) {
      toast(response?.error || 'Could not generate invoice', 'error');
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

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', async (event) => {
    const ctrlOrCmd = event.ctrlKey || event.metaKey;

    if (ctrlOrCmd && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      switchTab('clipboard');
      el.searchInput.focus();
      el.searchInput.select();
      return;
    }

    if (ctrlOrCmd && event.key === '1') {
      event.preventDefault();
      switchTab('clipboard');
      return;
    }

    if (ctrlOrCmd && event.key === '2') {
      event.preventDefault();
      switchTab('admin');
      return;
    }

    if (!ctrlOrCmd && event.key.toLowerCase() === 't') {
      toggleTheme();
      return;
    }

    if (ctrlOrCmd && event.shiftKey && event.key.toLowerCase() === 'c') {
      if (state.activeTab === 'admin' && el.templatePreview.value.trim()) {
        event.preventDefault();
        await copyToClipboard(el.templatePreview.value.trim(), 'Template copied');
      }
    }
  });
}

function bindStorageSync() {
  storageChangeHandler = (changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes[STORAGE_KEYS.CLIPBOARD_ITEMS]) {
      const oldValue = Array.isArray(changes[STORAGE_KEYS.CLIPBOARD_ITEMS].oldValue)
        ? changes[STORAGE_KEYS.CLIPBOARD_ITEMS].oldValue
        : [];
      const newValue = Array.isArray(changes[STORAGE_KEYS.CLIPBOARD_ITEMS].newValue)
        ? changes[STORAGE_KEYS.CLIPBOARD_ITEMS].newValue
        : [];

      state.clipboardItems = newValue;
      renderClipboard();

      if (newValue.length > oldValue.length) {
        toast('New clipboard item saved', 'success');
      }
    }
  };

  chrome.storage.onChanged.addListener(storageChangeHandler);
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

async function loadClipboardItems() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CLIPBOARD_HISTORY' });
    if (response?.ok && Array.isArray(response.data)) {
      state.clipboardItems = response.data;
      return;
    }

    const fallback = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_ITEMS);
    state.clipboardItems = Array.isArray(fallback[STORAGE_KEYS.CLIPBOARD_ITEMS])
      ? fallback[STORAGE_KEYS.CLIPBOARD_ITEMS]
      : [];
  } catch (_error) {
    state.clipboardItems = [];
  }
}

async function persistClipboardItems() {
  const pinned = state.clipboardItems.filter((item) => item.pinned);
  const unpinned = state.clipboardItems.filter((item) => !item.pinned);
  state.clipboardItems = [...pinned, ...unpinned].slice(0, MAX_CLIPBOARD_ITEMS);

  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: state.clipboardItems });
}

function renderClipboard() {
  const query = state.search;
  const items = state.clipboardItems.filter((item) => item.text.toLowerCase().includes(query));

  el.clipboardList.innerHTML = '';

  if (items.length === 0) {
    el.emptyState.classList.remove('hidden');
    return;
  }

  el.emptyState.classList.add('hidden');

  for (const item of items) {
    const card = document.createElement('article');
    card.className = `item ${item.pinned ? 'pinned' : ''}`;

    card.innerHTML = `
      <p class="item-text"></p>
      <div class="item-meta">
        <span>${item.pinned ? '📌 Pinned' : '📄 Clipboard'}</span>
        <time>${formatTimestamp(item.createdAt)}</time>
      </div>
      <div class="item-actions">
        <button data-action="copy">Copy</button>
        <button data-action="pin" class="ghost-btn">${item.pinned ? 'Unpin' : 'Pin'}</button>
        <button data-action="delete" class="ghost-btn">Delete</button>
      </div>
    `;

    card.querySelector('.item-text').textContent = truncate(item.text, 180);

    card.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      await copyToClipboard(item.text, 'Copied to clipboard');
    });

    card.querySelector('[data-action="pin"]').addEventListener('click', async () => {
      item.pinned = !item.pinned;
      await persistClipboardItems();
      renderClipboard();
      toast(item.pinned ? 'Item pinned' : 'Item unpinned', 'success');
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      state.clipboardItems = state.clipboardItems.filter((entry) => entry.id !== item.id);
      await persistClipboardItems();
      renderClipboard();
      toast('Item deleted', 'success');
    });

    el.clipboardList.appendChild(card);
  }
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

function renderTemplateButtons() {
  const labels = {
    paymentReminder: 'Payment Reminder',
    interviewInvitation: 'Interview Invitation',
    orderConfirmation: 'Order Confirmation'
  };

  for (const [key, label] of Object.entries(labels)) {
    const button = document.createElement('button');
    button.className = 'ghost-btn';
    button.textContent = label;
    button.addEventListener('click', () => {
      el.templatePreview.value = EMAIL_TEMPLATES[key];
      toast(`${label} loaded`, 'success');
    });
    el.templateButtons.appendChild(button);
  }

  el.templatePreview.value = EMAIL_TEMPLATES.paymentReminder;
}

function exportClipboardJson() {
  const blob = new Blob([JSON.stringify(state.clipboardItems, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'smart-admin-clipboard-history.json';
  link.click();
  URL.revokeObjectURL(url);
  toast('Clipboard exported', 'success');
}

async function importClipboardJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      throw new Error('JSON must be an array.');
    }

    const validated = parsed
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : `clip_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        text: String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 5000),
        pinned: Boolean(item.pinned),
        createdAt: Number(item.createdAt) || Date.now()
      }))
      .filter((item) => item.text);

    state.clipboardItems = validated.slice(0, MAX_CLIPBOARD_ITEMS);
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
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }
  return number;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

async function copyToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, 'success');
  } catch (_error) {
    toast('Copy failed. Check clipboard permission.', 'error');
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
