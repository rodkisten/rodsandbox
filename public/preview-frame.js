// This document always runs in an opaque sandbox, without allow-same-origin.
// Only the embedding parent can supply code. No host context or credentials enter.
window.addEventListener('message', function load(event) {
  if (event.source !== window.parent || event.data?.type !== 'RODSANDBOX_FRAME_HTML' ||
      typeof event.data.html !== 'string' || event.data.html.length > 10 * 1024 * 1024) return;
  window.removeEventListener('message', load);
  document.open();
  document.write(event.data.html);
  document.close();
});
window.parent.postMessage({ type: 'RODSANDBOX_FRAME_READY' }, '*');
