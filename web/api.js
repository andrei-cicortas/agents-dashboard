// WebSocket connection to the dashboard server with automatic reconnect.

const RETRY_MS = 1000;

export function connect({ onMessage, onConnectionChange }) {
  let socket = null;
  let serverStopped = false;

  function open() {
    socket = new WebSocket(`ws://${location.host}/ws`);
    socket.addEventListener('open', () => {
      onConnectionChange(true);
      socket.send(JSON.stringify({ type: 'hello' }));
    });
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'server:stopped') serverStopped = true;
      onMessage(message);
    });
    socket.addEventListener('close', () => {
      onConnectionChange(false);
      if (!serverStopped) setTimeout(open, RETRY_MS);
    });
  }

  open();

  return {
    send(type, payload = {}) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
    },
  };
}
