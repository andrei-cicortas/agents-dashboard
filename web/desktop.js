// The native window around the page, when there is one (desktop/window.ps1).
// Opened in a plain browser there is no window to talk to, and these quietly
// do nothing.

const host = globalThis.chrome?.webview;

export const inWindow = Boolean(host);

export function tellWindow(message) {
  host?.postMessage(message);
}

// What the window says back, such as a Windows notification being clicked.
export function onWindowMessage(handler) {
  host?.addEventListener('message', (event) => handler(event.data));
}
