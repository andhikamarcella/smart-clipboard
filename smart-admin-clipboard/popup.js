const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems',
  THEME: 'theme'
};

const MAX_CLIPBOARD_ITEMS = 50;

const EMAIL_TEMPLATES = {
  paymentReminder:
    'Subject: Friendly Payment Reminder\n\nHello [Name],\n\nThis is a kind reminder that invoice [Invoice #] is due on [Date]. Please let us know once payment has been made.\n\nBest regards,\n[Your Name]',
  interviewInvitation:
    'Subject: Interview Invitation\n\nHi [Candidate Name],\n\nWe are pleased to invite you to an interview for the [Role] position on [Date/Time]. Please confirm your availability.\n\nRegards,\n[Hiring Team]',
  orderConfirmation:
    'Subject: Order Confirmation\n\nHello [Customer Name],\n\nThank you for your order #[Order ID]. Your order has been confirmed and is being prepared for shipment.\n\nCheers,\n[Support Team]'
};

const state = {
  clipboardItems: [],
  activeTab: 'clipboard',
  search: ''
};

const el = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  mapElements();
  bindBaseEvents();
  bindAdminToolsEvents();
  bindKeyboardShortcuts();
  await hydrateTheme();
  await loadClipboardItems();
  renderClipboardList();
  renderTemplateButtons();
  updateCalculator();
}

function mapElements() {
  Object.assign(el, {
    app: document.getElementById('app'),
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
    emptyClipboard: document.getElementById('emptyClipboard'),
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

function bindBaseEvents() {
  el.tabs.forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => switchTab(tabBtn.dataset.tab));
  });

  el.themeToggle.addEventListener('click', toggleTheme);
  el.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.toLowerCase().trim();
    renderClipboardList();
  });

  el.clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Clear all clipboard items?')) return;
    state.clipboardItems = [];
    await persistClipboardItems();
    renderClipboardList();
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
    toast('Invoice number generated', 'success');
  });

  el.copyInvoiceBtn.addEventListener('click', async () => {
    if (!el.invoiceOutput.value) {
      toast('Generate an invoice number first', 'error');
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
    }

    if (ctrlOrCmd && event.key === '1') {
      event.preventDefault();
      switchTab('clipboard');
    }

    if (ctrlOrCmd && event.key === '2') {
      event.preventDefault();
      switchTab('admin');
    }

    if (event.key.toLowerCase() === 't' && !ctrlOrCmd) {
      toggleTheme();
    }

    if (ctrlOrCmd && event.shiftKey && event.key.toLowerCase() === 'c') {
      if (state.activeTab === 'admin' && el.templatePreview.value.trim()) {
        event.preventDefault();
        await copyToClipboard(el.templatePreview.value.trim(), 'Template copied');
      }
    }
  });
}

function switchTab(tabName) {
  state.activeTab = tabName;
  Object.entries(el.panels).forEach(([name, panel]) => {
    panel.classList.toggle('active', name === tabName);
  });

  el.tabs.forEach((tabBtn) => {
    const selected = tabBtn.dataset.tab === tabName;
    tabBtn.classList.toggle('active', selected);
    tabBtn.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

async function hydrateTheme() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.THEME);
  const theme = result[STORAGE_KEYS.THEME] || 'light';
  applyTheme(theme);
}

async function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: next });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

async function loadClipboardItems() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_ITEMS);
  state.clipboardItems = Array.isArray(result[STORAGE_KEYS.CLIPBOARD_ITEMS])
    ? result[STORAGE_KEYS.CLIPBOARD_ITEMS]
    : [];
}

async function persistClipboardItems() {
  const pinned = state.clipboardItems.filter((item) => item.pinned);
  const unpinned = state.clipboardItems.filter((item) => !item.pinned);
  state.clipboardItems = [...pinned, ...unpinned].slice(0, MAX_CLIPBOARD_ITEMS);
  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: state.clipboardItems });
}

function renderClipboardList() {
  const query = state.search;
  const items = state.clipboardItems.filter((item) => item.text.toLowerCase().includes(query));

  el.clipboardList.innerHTML = '';

  if (!items.length) {
    el.emptyClipboard.classList.remove('hidden');
    return;
  }

  el.emptyClipboard.classList.add('hidden');

  items.forEach((item) => {
    const node = document.createElement('article');
    node.className = `item ${item.pinned ? 'pinned' : ''}`;
    node.innerHTML = `
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

    node.querySelector('.item-text').textContent = truncate(item.text, 180);

    node.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      await copyToClipboard(item.text, 'Copied to clipboard');
    });

    node.querySelector('[data-action="pin"]').addEventListener('click', async () => {
      item.pinned = !item.pinned;
      await persistClipboardItems();
      renderClipboardList();
      toast(item.pinned ? 'Item pinned' : 'Item unpinned', 'success');
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      state.clipboardItems = state.clipboardItems.filter((entry) => entry.id !== item.id);
      await persistClipboardItems();
      renderClipboardList();
      toast('Item deleted', 'success');
    });

    el.clipboardList.appendChild(node);
  });
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

async function exportClipboardJson() {
  const blob = new Blob([JSON.stringify(state.clipboardItems, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'smart-admin-clipboard-history.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Clipboard history exported', 'success');
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
        text: String(item.text || '').trim().slice(0, 5000),
        pinned: Boolean(item.pinned),
        createdAt: Number(item.createdAt) || Date.now()
      }))
      .filter((item) => item.text);

    state.clipboardItems = validated.slice(0, MAX_CLIPBOARD_ITEMS);
    await persistClipboardItems();
    renderClipboardList();
    toast('Clipboard history imported', 'success');
  } catch (error) {
    toast(`Import failed: ${error.message}`, 'error');
  } finally {
    event.target.value = '';
  }
}

function parseNumber(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return null;
  }
  return num;
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function copyToClipboard(text, successMessage = 'Copied') {
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

  window.setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    window.setTimeout(() => node.remove(), 200);
  }, 2200);
}
