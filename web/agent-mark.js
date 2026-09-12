// Gives every agent a stable colour and initial, so a panel header says which
// agent it is at a glance. Agents added to config/agents.json later are not
// listed here, so unknown ids fall back to a colour derived from the id.

const COLOURS = {
  claude: '#d97757',
  codex: '#e6e6e6',
  gemini: '#7aa2f7',
  copilot: '#a78bfa',
  cursor: '#5fd39a',
  grok: '#f4f4f5',
};

// The same id always lands on the same hue; kept light so the dark initial reads.
function fallbackColour(agentId) {
  let hash = 0;
  for (const char of agentId) hash = (hash * 31 + char.codePointAt(0)) % 360;
  return `hsl(${hash} 55% 72%)`;
}

export const agentColour = (agentId) => COLOURS[agentId] ?? fallbackColour(agentId);

export const agentInitial = (panel) => (panel.agentName || panel.agentId || '?').trim().charAt(0).toUpperCase();
