// Captures copy events from editable contexts and sends to service worker.

(function initClipboardCapture() {
  document.addEventListener('copy', async () => {
    try {
      const selectedText = getClipboardCandidateText();
      if (!selectedText) {
        return;
      }

      await chrome.runtime.sendMessage({
        type: 'SAVE_CLIPBOARD',
        payload: { text: selectedText }
      });
    } catch (error) {
      // Silent fail: content scripts should never disrupt page behavior.
      console.debug('Smart Admin Clipboard copy capture skipped:', error?.message);
    }
  });
})();

function getClipboardCandidateText() {
  const active = document.activeElement;

  if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'))) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && end > start) {
      return active.value.slice(start, end).trim();
    }
  }

  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}
