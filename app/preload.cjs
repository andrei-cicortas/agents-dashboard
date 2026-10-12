// The page's only way to the window around it (app/desktop.js): it may post
// the few messages web/desktop.js sends, and hear what the window says back.

const { contextBridge, ipcRenderer } = require('electron');

// The unread count as the red disc the taskbar shows on the app's button, the
// way mail and chat apps show theirs. Only a page has a canvas to draw it on.
function drawBadge(count) {
  const label = count > 9 ? '9+' : String(count);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e5484d';
  context.beginPath();
  context.arc(16, 16, 16, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = `bold ${label.length > 1 ? 15 : 20}px "Segoe UI", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 16, 17);
  return canvas.toDataURL('image/png');
}

contextBridge.exposeInMainWorld('desktopHost', {
  postMessage(message) {
    if (message?.type === 'window:badge' && message.count > 0) {
      message = { ...message, image: drawBadge(message.count) };
    }
    ipcRenderer.send('page-message', message);
  },
  onMessage(handler) {
    ipcRenderer.on('window-message', (event, message) => handler(message));
  },
});
