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

// The state of a folder as a whole, from the panels inside it. A folded folder
// still has to say that something in it is waiting for you, or has stopped —
// otherwise the only place that shows it is a list you cannot see.
export function folderState(panels) {
  const agents = panels.filter((panel) => panel.kind !== 'browser');
  if (agents.some((panel) => panel.attention)) {
    return { tone: 'attention', note: 'An agent in here needs your input' };
  }
  if (agents.some((panel) => !isActive(panel))) {
    return { tone: 'stopped', note: 'An agent in here has stopped' };
  }
  return { tone: '', note: agents.length === 1 ? '1 agent running' : `${agents.length} agents running` };
}

export function sameFolder(a, b) {
  const clean = (p) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return clean(a) === clean(b);
}
