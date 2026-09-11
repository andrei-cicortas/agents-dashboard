// Panel status helpers shared by the sidebar, grid, and panels.

export function dotClass(panel) {
  if (panel.attention) return 'attention';
  if (panel.status === 'running' || panel.status === 'starting') return panel.status;
  return 'stopped';
}

export function isActive(panel) {
  return panel.status === 'running' || panel.status === 'starting';
}

export function sameFolder(a, b) {
  const clean = (p) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return clean(a) === clean(b);
}
