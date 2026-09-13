// What a key pressed in a terminal panel is for.
//
// A terminal wants every keystroke, so only a few are taken from the agent,
// the ones Windows Terminal takes too. Pure, so the choice is tested without a
// terminal; the panel does the copying and finding, and leaves a paste to the
// browser.

export function terminalKey(event, { hasSelection }) {
  if (!event.ctrlKey || event.altKey || event.metaKey) return 'agent';
  // By key code, which is how the terminal picks the key it turns into ^V, so
  // no keyboard layout lets one slip past to the agent.
  if (event.keyCode === 86) return 'paste';
  const key = event.key.toLowerCase();
  if (key === 'c' && hasSelection) return 'copy';
  if (key === 'f' && !event.shiftKey) return 'find';
  return 'agent';
}
