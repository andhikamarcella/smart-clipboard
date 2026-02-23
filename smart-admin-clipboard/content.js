// Smart Admin Clipboard - Content Script
// Clipboard capture path A: automatic listener via copy events.

(() => {
  const LOG_PREFIX = '[SAC][CONTENT]';
  let isInitialized = false;

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    console.log(LOG_PREFIX, 'Loaded at:', window.location.href);
    document.addEventListener('copy', onCopyEvent, { capture: true });
    console.log(LOG_PREFIX, 'copy listener attached');
  }

  async function onCopyEvent(event) {
    try {
      console.log(LOG_PREFIX, 'copy event fired');

      // Required method: capture selected text via Selection API.
      const fromSelection = window.getSelection().toString();
      const fromClipboardData = event?.clipboardData?.getData?.('text/plain') || '';
      const text = sanitizeText(fromClipboardData || fromSelection);

      if (!text) {
        console.log(LOG_PREFIX, 'skip save (empty)');
        return;
      }

      if (text.length < 2) {
        console.log(LOG_PREFIX, 'skip save (length < 2)');
        return;
      }

      console.log(LOG_PREFIX, 'sending SAVE_CLIPBOARD message:', text.slice(0, 100));

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CLIPBOARD',
        payload: {
          text,
          source: 'content'
        }
      });

      if (response?.ok) {
        console.log(LOG_PREFIX, 'background response:', response.data);
      } else {
        console.warn(LOG_PREFIX, 'background error:', response?.error || 'unknown');
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'onCopyEvent error:', error);
    }
  }

  function sanitizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  }

  init();
})();
