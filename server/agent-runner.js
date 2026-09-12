// Runs one turn of a named agent by calling the Claude Code CLI in print mode
// and reading the stream of JSON events it writes.
//
// Using the CLI the dashboard already requires means an agent signs in the way
// the rest of the app does, with no second dependency and no API key of its
// own. Threads are the CLI's own sessions, continued with --resume.

import { spawn as defaultSpawn } from 'node:child_process';

// What an agent may touch unless it has been given a wider list on purpose.
// A named agent answers on its own, with nobody watching to approve anything,
// so the default cannot include running commands or changing files.
export const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];

export function runArgs({ prompt, sessionId, instructions, tools, model }) {
  const args = ['--print', prompt, '--output-format', 'stream-json', '--verbose'];
  if (sessionId) args.push('--resume', sessionId);
  if (instructions && instructions.trim()) args.push('--append-system-prompt', instructions.trim());
  if (model) args.push('--model', model);
  const set = tools?.length ? tools : READ_ONLY_TOOLS;
  // --tools decides which tools exist at all. Denying a tool by name does not
  // hold: told it could not use Bash, an agent found another tool that also
  // runs commands and used that instead. --allowedTools then says these may be
  // used without stopping to ask a person who is not sitting there.
  args.push('--tools', set.join(','), '--allowedTools', ...set);
  // Skills, hooks, MCP servers and CLAUDE.md belong to whoever is at this PC.
  // An agent here should answer from its own instructions instead, and behave
  // the same on a machine set up differently.
  args.push('--safe-mode');
  return args;
}

export function createAgentRunner({ spawn = defaultSpawn, command = 'claude' } = {}) {
  return {
    run({ cwd, prompt, sessionId, instructions, tools, model }, { onEvent, onDone }) {
      const child = spawn(command, runArgs({ prompt, sessionId, instructions, tools, model }), {
        cwd,
        // The prompt goes in as an argument, so nothing is ever written in.
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let pending = '';
      let complaint = '';
      let finished = false;

      const read = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          // The CLI also prints the odd human-readable line; it is not an event.
          return;
        }
        onEvent(event);
      };

      const finish = (outcome) => {
        if (finished) return;
        finished = true;
        onDone(outcome);
      };

      child.stdout.on('data', (chunk) => {
        pending += chunk.toString();
        const lines = pending.split('\n');
        // Whatever follows the last newline is only part of a line so far.
        pending = lines.pop() ?? '';
        for (const line of lines) read(line);
      });
      child.stderr.on('data', (chunk) => { complaint += chunk.toString(); });
      child.on('error', (err) => finish({ ok: false, message: err.message }));
      child.on('close', (code) => {
        // An agent that exits without its last newline still said something.
        read(pending);
        pending = '';
        finish({ ok: code === 0, message: code === 0 ? null : (complaint.trim() || `The agent exited with code ${code}.`) });
      });

      return { cancel: () => child.kill() };
    },
  };
}
