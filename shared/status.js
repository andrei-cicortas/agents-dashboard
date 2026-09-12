// Panel status helpers shared by the sidebar, grid, and panels.

export function dotClass(panel) {
  // A web pane has no process behind it, so none of the agent states apply.
  if (panel.kind === 'browser') return 'browser';
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
