const STORAGE_KEYS = {
  CLIPBOARD_ITEMS: 'clipboardItems'
};

const state = {
  items: [],
  query: ''
};

const el = {};
let storageListener = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  mapElements();
  bindEvents();
  bindStorageListener();

  await checkContentScriptConnection();
  await refreshClipboardHistory();
}

window.addEventListener('unload', () => {
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
  }
});

function mapElements() {
  el.connectionIndicator = document.getElementById('connectionIndicator');
  el.searchInput = document.getElementById('searchInput');
  el.refreshBtn = document.getElementById('refreshBtn');
  el.clipboardList = document.getElementById('clipboardList');
  el.emptyState = document.getElementById('emptyState');
  el.toastContainer = document.getElementById('toastContainer');
}

function bindEvents() {
  el.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.toLowerCase().trim();
    renderList();
  });

  el.refreshBtn.addEventListener('click', async () => {
    await refreshClipboardHistory();
    await checkContentScriptConnection();
    toast('Clipboard refreshed', 'success');
  });
}

function bindStorageListener() {
  storageListener = (changes, areaName) => {
    if (areaName !== 'local' || !changes[STORAGE_KEYS.CLIPBOARD_ITEMS]) return;

    const next = Array.isArray(changes[STORAGE_KEYS.CLIPBOARD_ITEMS].newValue)
      ? changes[STORAGE_KEYS.CLIPBOARD_ITEMS].newValue
      : [];

    state.items = next;
    renderList();
  };

  chrome.storage.onChanged.addListener(storageListener);
}

async function checkContentScriptConnection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !tab.url) {
      setConnectionIndicator(false, 'Content script not detected');
      return;
    }

    if (!/^https?:/i.test(tab.url)) {
      setConnectionIndicator(false, 'Content script not detected');
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const hasMarker = typeof window !== 'undefined' && !!window.getSelection;
        return hasMarker;
      }
    });

    if (!result) {
      setConnectionIndicator(false, 'Content script not detected');
      return;
    }

    const ping = await chrome.runtime.sendMessage({ type: 'PING_CONTENT' });
    if (ping?.ok) {
      setConnectionIndicator(true, 'Content script connected');
    } else {
      setConnectionIndicator(false, 'Content script not detected');
    }
  } catch (_error) {
    setConnectionIndicator(false, 'Content script not detected');
  }
}

function setConnectionIndicator(connected, text) {
  el.connectionIndicator.textContent = text;
  el.connectionIndicator.classList.toggle('connected', connected);
  el.connectionIndicator.classList.toggle('disconnected', !connected);
}

async function refreshClipboardHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CLIPBOARD_HISTORY' });
    if (response?.ok && Array.isArray(response.data)) {
      state.items = response.data;
      renderList();
      return;
    }
  } catch (error) {
    console.warn('[SAC][POPUP] GET_CLIPBOARD_HISTORY failed:', error);
  }

  try {
    const fallback = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_ITEMS);
    state.items = Array.isArray(fallback[STORAGE_KEYS.CLIPBOARD_ITEMS])
      ? fallback[STORAGE_KEYS.CLIPBOARD_ITEMS]
      : [];
  } catch (_error) {
    state.items = [];
  }

  renderList();
}

function renderList() {
  const filtered = state.items.filter((item) => item.text.toLowerCase().includes(state.query));
  el.clipboardList.innerHTML = '';

  if (!filtered.length) {
    el.emptyState.classList.remove('hidden');
    return;
  }

  el.emptyState.classList.add('hidden');

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'item';
    card.innerHTML = `
      <p class="item-text"></p>
      <div class="item-meta">
        <span>${item.source || 'content'}</span>
        <time>${formatTime(item.createdAt)}</time>
      </div>
      <div class="item-actions">
        <button data-action="copy">Copy</button>
        <button data-action="delete" class="ghost-btn">Delete</button>
      </div>
    `;

    card.querySelector('.item-text').textContent = truncate(item.text, 180);

    card.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(item.text);
        toast('Copied to clipboard', 'success');
      } catch (_error) {
        toast('Copy failed', 'error');
      }
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      state.items = state.items.filter((entry) => entry.id !== item.id);
      await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_ITEMS]: state.items });
      renderList();
      toast('Item deleted', 'success');
    });

    el.clipboardList.appendChild(card);
  });
}

function formatTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  el.toastContainer.appendChild(node);

  setTimeout(() => {
    node.remove();
  }, 2200);
}
