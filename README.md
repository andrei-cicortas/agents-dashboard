# Agents Dashboard

A desktop dashboard for running several AI coding agents side by side, each in
its own real terminal and project folder. It currently supports **Claude Code**
and **Codex**.

The app is a small Node.js server plus a web page shown in a Microsoft Edge
app window. The server keeps the agents running even when the window is closed.

## Requirements

- Windows 11
- Node.js 24 or newer
- Microsoft Edge (comes with Windows)
- Claude Code, logged in: run `claude` once in a terminal and follow the login
- Optional: Codex — `npm install -g @openai/codex`, then `codex login`

## First-time setup

```powershell
npm install
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1
```

This puts an **Agents Dashboard** shortcut on your desktop.

## Daily use

1. Double-click **Agents Dashboard** on the desktop.
2. Click **+** next to "Workspaces". Paste a folder path, or **Browse…** for
   one.
3. Hover the project, click **+**, and pick Claude Code or Codex.
4. Type your task into the panel's terminal.
5. The bell shows when an agent finishes or needs your input.

The sidebar lists pinned folders first, then every other folder under
**Folders**. The canvas shows one workspace at a time: click a folder to open
it, or the chevron to fold its list of agents. Agents in other folders keep
running. The card at the bottom shows who is signed in to the PC, how much is
running, and the two settings that belong to the window.

## Arranging the panels

Panels tile the canvas, so there is always exactly enough room for all of them.

- Drag the line between two panels to give one of them more space.
- **Split right** and **Split down** in a panel's **...** menu start another
  agent of the same kind beside it.
- The grid button in the top bar has **Tidy**, which squares everything up
  again, and fixed column counts.
- The arrows in a panel header make it fill the canvas, and put it back.

Each workspace keeps its own arrangement, and it is still there when you
reopen the window.

## Web panes

**New web page** in a folder's **+** menu docks a browser beside the terminals,
so you can look at what the agents just built without leaving the window. It
starts on `http://localhost:3000`; type another address in its header and press
Enter. Only `http` and `https` addresses are accepted.

A web pane is an ordinary pane: it splits, resizes, maximises and is saved with
the rest of the arrangement. It runs no agent, so it never rings the bell and
is not counted among the running agents.

Some sites refuse to be shown inside another page (they send
`X-Frame-Options` or a `frame-ancestors` policy) and will come up blank. Local
dev servers normally do not.

## Agent mode

The **Agent** tab is the other half of the app. Where the Code tab gives you a
terminal to sit at, an agent answers on its own: you name it, give it a folder
and standing instructions, and then hold conversations with it.

- **+** next to Agents names one. The instructions are appended to its system
  prompt, so they apply to everything it is ever asked.
- Each agent keeps **threads** — separate conversations, shown as tabs. A
  thread remembers its session, so a later message continues where it left off.
- The transcript shows a line per thing: what you asked, what it did (each tool
  with a tick when it worked), and what it said back.

It runs the Claude Code CLI you already have, so it signs in the way the rest
of the app does — no API key and no second subscription — and each message
costs what a Claude Code message costs.

### What an agent is allowed to touch

A new agent can only **read**: Read, Glob, Grep, WebSearch and WebFetch. It
cannot run commands or change files. Nobody is sitting there to approve
anything, so that is the only safe default.

The gear next to its name has **Let it change files**, which asks first and
then adds Edit, Write and Bash. Give that to an agent whose folder you would
be happy to see rewritten.

The list is enforced by handing the CLI the set of tools that exist for that
run, not by forbidding tools by name: told it could not use Bash, an agent
found another tool that also runs commands and used that instead.

Agents also run with the CLI's `--safe-mode`, so your own CLAUDE.md, skills,
hooks and MCP servers are left out. An agent should behave the way its own
instructions say, not the way your machine happens to be set up.

## Colour themes

The moon button in the sidebar's account card switches between ten dark themes
— Midnight,
Void, Tokyo Night, Dracula, Nord, Catppuccin, Gruvbox, One Dark, Solarized and
Synthwave. The terminals change with the rest of the app. The choice is kept in
the browser, so it belongs to the window rather than to the agents.

To add one, put it in `shared/themes.js`: eight colours for the app and the
sixteen a terminal needs. The tests check that none of them is missing.

Closing the window does **not** stop the agents. Open the shortcut again to see
them. **Settings** (the gear in the account card) stops all agents and the
server.

## How a panel finds its conversation again

Closing the window does not end a conversation, so a panel has to know which
one to pick up. The two agents go about that differently.

Claude Code is told which session to use, so the dashboard names one and asks
for it again later. Codex names its own and offers no way to choose it, so the
dashboard reads the id back out of what Codex wrote, and resumes that. Using
`codex resume --last` instead would give every panel on a folder the same
conversation, which is wrong the moment two agents work side by side.

Either way the id is only written down once the conversation is real — a panel
you opened and never typed into has nothing to resume, so it simply starts. If
a resume fails anyway, the panel starts fresh instead of staying dead.

## Adding another agent type

Add an entry to `config/agents.json`:

- `command`: the program to run (must be on PATH)
- `startArgs` / `resumeArgs`: arguments for a new session / for continuing one
- placeholders: `{sessionId}`, `{claudeHooksFile}`, `{codexNotify}`
- `installHint`: shown when the command is not installed
- `sessionSource`: `"codex"` for an agent that names its own session, so its id
  is read back after it starts rather than chosen in advance

Restart the dashboard (Settings → stop, then the shortcut).

## Where things are stored

- State (workspaces, panels, notifications, panel arrangements, agents and
  their threads):
  `%APPDATA%\agents-dashboard\state.json`
- Server logs: `%APPDATA%\agents-dashboard\server.log` and `server-error.log`

## Troubleshooting

- **"Port 4317 is used by another program"**: another app uses that port. Close it.
- **A panel says the agent is not installed**: install it, then click Retry.
- **Claude Code panel asks to log in**: log in inside the panel, or run `claude` once in a normal terminal.
- **Nothing happens when double-clicking the shortcut**: run
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launch.ps1` in a
  terminal to see the error, and check `server-error.log`.

## Trying the UI without real agents

```powershell
node test/fixtures/dev-setup.js
$env:DASHBOARD_AGENTS_FILE = "$PWD\test\.tmp\dev\agents.json"
$env:DASHBOARD_STATE_FILE = "$PWD\test\.tmp\dev\state.json"
node server/index.js
```

Open http://127.0.0.1:4317. The "Test Agent" echoes what you type; type
`notify` or `done` to ring the bell.

## Manual checklist (real agents)

- [ ] Double-click the shortcut → the dashboard window opens.
- [ ] Add a project folder with **+** → it appears under Workspaces.
- [ ] Pin it → it moves under "Pinned".
- [ ] Start Claude Code → the panel shows Claude's prompt; send a message and get a reply.
- [ ] When Claude finishes, the bell badge goes up and says "finished".
- [ ] When Claude asks for permission, the dot turns orange and the bell says "needs your input".
- [ ] The sidebar row changes to the conversation topic (the panel header keeps
      showing the folder, with the agent's coloured mark next to it).
- [ ] The Agent and Chat tabs show their "coming soon" placeholder.
- [ ] Split a panel right, then down → the three tile with no gaps.
- [ ] Drag a line between two panels → both resize, and neither can be dragged
      away to nothing.
- [ ] Close a panel → its space goes to its neighbour.
- [ ] Tidy → the panels square up into a grid.
- [ ] Add a second folder, start an agent in it, switch between the two → each
      folder keeps its own arrangement and the other agents keep running.
- [ ] Rearrange, close the window, open the shortcut again → the arrangement
      comes back.
- [ ] Open the dashboard in two windows → splitting in one shows up in the
      other, and neither undoes the other.
- [ ] Pick a theme → the app and the running terminals both change, and the
      choice is still there after a reload.
- [ ] Start a dev server, add a web pane, point it at it → the page shows, and
      Reload fetches it again.
- [ ] Close the window and open it again → the web pane comes back on the same
      address.
- [ ] Agent tab → **+** → name an agent and pick a folder → it appears in the rail.
- [ ] Ask it something → the status says Working, then Ready, and the answer
      appears with a line per tool it used.
- [ ] Ask it to run a shell command → it says it has no tool for that.
- [ ] Gear → Let it change files → confirm → the header says it may change files.
- [ ] Open a second thread, ask something else → the two tabs keep their own
      conversations, and each continues where it left off after a reload.
- [ ] Start Codex (or see the install hint if it is not installed).
- [ ] Close the window, wait, open the shortcut again → the panels are still there with their output.
- [ ] Settings → Stop all agents and close → confirm → "Dashboard stopped".
- [ ] Open the shortcut again → the panels come back and Claude continues its conversation.
- [ ] Leave Claude idle for more than 60 seconds after it finishes → the panel stays green (no "needs your input").
- [ ] Click into a Claude panel, close the window, let Claude finish, reopen → the bell badge shows 1.
- [ ] Reload the window with Claude open → no stray characters (like `[?1;2c`) appear in Claude's prompt box.
- [ ] Two Codex panels in one folder, each given something different to
      remember → after a restart each carries on its own conversation, not the
      same one twice.
