// Only this app's own window may control the agents. These checks stop other
// websites open in the browser (Origin) and DNS-rebinding tricks (Host).

import crypto from 'node:crypto';

export function isAllowedHost(hostHeader, port) {
  if (typeof hostHeader !== 'string') return false;
  const host = hostHeader.toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function isAllowedOrigin(originHeader, port) {
  return originHeader === `http://127.0.0.1:${port}` || originHeader === `http://localhost:${port}`;
}

export function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function isValidToken(provided, expected) {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
