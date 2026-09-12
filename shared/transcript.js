// Turns the stream of events a headless agent prints into the handful of lines
// a person actually wants to read: what was said, what was done, what failed.
//
// Pure on purpose. The server builds the transcript so every window sees the
// same one, and the browser uses the same code to draw it.

const MAX_DETAIL = 160;

// How each tool should read in the transcript. A tool not named here still
// gets a line — being surprised by a tool is not a reason to hide it.
const TOOLS = {
  Bash: { verb: 'Run', from: (i) => i.command },
  PowerShell: { verb: 'Run', from: (i) => i.command },
  Read: { verb: 'Read', from: (i) => i.file_path },
  Edit: { verb: 'Edit', from: (i) => i.file_path },
  Write: { verb: 'Write', from: (i) => i.file_path },
  NotebookEdit: { verb: 'Edit', from: (i) => i.notebook_path },
  Grep: { verb: 'Search', from: (i) => i.pattern },
  Glob: { verb: 'Search', from: (i) => i.pattern },
  WebSearch: { verb: 'Search the web', from: (i) => i.query },
  WebFetch: { verb: 'Read the web', from: (i) => i.url },
  Task: { verb: 'Hand off', from: (i) => i.description },
};

const shorten = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL - 1)}…` : text;
};

export function toolLine(name, input = {}) {
  const known = TOOLS[name];
  if (!known) return { verb: 'Use', detail: shorten(name) };
  return { verb: known.verb, detail: shorten(known.from(input) ?? name) };
}

export function emptyTranscript() {
  return [];
}

function fromAssistant(items, event) {
  const blocks = event.message?.content ?? [];
  const added = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.text?.trim()) {
      added.push({ kind: 'said', by: 'agent', text: block.text });
    } else if (block.type === 'thinking') {
      // The reasoning itself is private; that it happened is worth a line.
      added.push({ kind: 'thought' });
    } else if (block.type === 'tool_use') {
      added.push({ kind: 'tool', id: block.id, ...toolLine(block.name, block.input), status: 'running' });
    }
  }
  return added.length ? [...items, ...added] : items;
}

function fromToolResults(items, event) {
  const results = (event.message?.content ?? []).filter((block) => block.type === 'tool_result');
  if (!results.length) return items;
  let changed = false;
  const next = items.map((item) => {
    const result = item.kind === 'tool' ? results.find((r) => r.tool_use_id === item.id) : null;
    if (!result) return item;
    changed = true;
    return { ...item, status: result.is_error ? 'failed' : 'done' };
  });
  return changed ? next : items;
}

export function applyEvent(items, event) {
  if (!event || typeof event !== 'object') return items;
  switch (event.type) {
    case 'prompt':
      return [...items, { kind: 'said', by: 'you', text: event.text }];
    case 'assistant':
      return fromAssistant(items, event);
    case 'user':
      return fromToolResults(items, event);
    case 'result':
      // A successful run ends by repeating its own last words, which are
      // already in the transcript; only a failure has something to add.
      return event.subtype === 'success' ? items : [...items, { kind: 'failed', text: event.result ?? 'The agent stopped.' }];
    default:
      return items;
  }
}
