(() => {
  const LOG_PREFIX = '[SAC][CONTENT]';
  const MIN_LENGTH = 2;

  let lastSelectedText = '';
  let lastSentText = '';
  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    // Required debug marker requested by user.
    console.log('Content script active');
    console.log(LOG_PREFIX, 'Injected on:', window.location.href);

    document.addEventListener('selectionchange', onSelectionChange, { passive: true });
    document.addEventListener('copy', onCopyEvent, { capture: true });
    document.addEventListener('keyup', onKeyUp, { capture: true });
  }

  function onSelectionChange() {
    const selected = sanitize(window.getSelection().toString());
    if (selected && selected.length >= MIN_LENGTH) {
      lastSelectedText = selected;
      console.log(LOG_PREFIX, 'selectionchange captured:', selected.slice(0, 80));
    }
  }

  async function onCopyEvent(event) {
    console.log(LOG_PREFIX, 'copy event fired');

    const fromSelection = sanitize(window.getSelection().toString());
    const fromClipboard = sanitize(event?.clipboardData?.getData?.('text/plain') || '');
    const bestText = fromClipboard || fromSelection || lastSelectedText;

    await sendClipboardCandidate(bestText, 'copy_event');
  }

  async function onKeyUp(event) {
    const isCopyShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c';
    if (!isCopyShortcut) return;

    console.log(LOG_PREFIX, 'Ctrl/Cmd + C detected');

    // Defer slightly so selection/clipboard has settled.
    window.setTimeout(async () => {
      const selected = sanitize(window.getSelection().toString()) || lastSelectedText;
      await sendClipboardCandidate(selected, 'keyboard_copy');
    }, 30);
  }

  async function sendClipboardCandidate(text, source) {
    const candidate = sanitize(text);

    if (!candidate) {
      console.log(LOG_PREFIX, 'skip send (empty)', source);
      return;
    }

    if (candidate.length < MIN_LENGTH) {
      console.log(LOG_PREFIX, 'skip send (too short)', source);
      return;
    }

    if (candidate === lastSentText) {
      console.log(LOG_PREFIX, 'skip send (duplicate consecutive local)', source);
      return;
    }

    console.log(LOG_PREFIX, 'sending message:', source, candidate.slice(0, 100));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CLIPBOARD',
        payload: {
          text: candidate,
          source,
          url: window.location.href
        }
      });

      if (response?.ok) {
        if (response.data?.saved) {
          lastSentText = candidate;
          console.log(LOG_PREFIX, 'saved by background');
        } else {
          console.log(LOG_PREFIX, 'background skipped:', response.data?.reason);
        }
      } else {
        console.warn(LOG_PREFIX, 'message failed:', response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'sendMessage error:', error);
    }
  }

  function sanitize(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  }

  init();
})();
