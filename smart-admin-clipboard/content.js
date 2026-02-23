// Smart Admin Clipboard - content script
// Captures copy events and forwards selected text to service worker.

(() => {
  const LOG_PREFIX = '[SAC][CONTENT]';
  let isBound = false;

  function init() {
    if (isBound) {
      return;
    }

    isBound = true;
    document.addEventListener('copy', onCopy, { capture: true });
    console.log(LOG_PREFIX, 'Copy listener attached on', window.location.href);
  }

  async function onCopy() {
    try {
      // Required by spec: use window.getSelection().toString()
      const selectedText = window.getSelection().toString();
      const text = sanitizeText(selectedText);

      if (!text) {
        console.log(LOG_PREFIX, 'Copy ignored: empty selection');
        return;
      }

      console.log(LOG_PREFIX, 'Copy captured:', text.slice(0, 80));

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CLIPBOARD',
        payload: { text, url: window.location.href }
      });

      if (response?.ok) {
        if (response.data?.skipped) {
          console.log(LOG_PREFIX, 'Skipped save:', response.data.reason);
        } else {
          console.log(LOG_PREFIX, 'Saved successfully');
        }
      } else {
        console.warn(LOG_PREFIX, 'Save failed:', response?.error || 'Unknown error');
      }
    } catch (error) {
      // Never throw from content script event listeners.
      console.error(LOG_PREFIX, 'Copy handler error:', error);
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
