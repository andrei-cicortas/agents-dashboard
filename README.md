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
2. Click **+** next to "Workspaces" and choose a project folder.
3. Hover the project, click **+**, and pick Claude Code or Codex.
4. Type your task into the panel's terminal.
5. The bell shows when an agent finishes or needs your input.

Closing the window does **not** stop the agents. Open the shortcut again to see
them. The power button (top right) stops all agents and the server.

## Adding another agent type

Add an entry to `config/agents.json`:

- `command`: the program to run (must be on PATH)
- `startArgs` / `resumeArgs`: arguments for a new session / for continuing one
- placeholders: `{sessionId}`, `{claudeHooksFile}`, `{codexNotify}`
- `installHint`: shown when the command is not installed

Restart the dashboard (power button, then the shortcut).

## Where things are stored

- State (workspaces, panels, notifications): `%APPDATA%\agents-dashboard\state.json`
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
- [ ] Start Codex (or see the install hint if it is not installed).
- [ ] Close the window, wait, open the shortcut again → the panels are still there with their output.
- [ ] Power button → confirm → "Dashboard stopped".
- [ ] Open the shortcut again → the panels come back and Claude continues its conversation.
- [ ] Leave Claude idle for more than 60 seconds after it finishes → the panel stays green (no "needs your input").
- [ ] Click into a Claude panel, close the window, let Claude finish, reopen → the bell badge shows 1.
- [ ] Reload the window with Claude open → no stray characters (like `[?1;2c`) appear in Claude's prompt box.
- [ ] Codex (after installing it): the panel starts, `codex resume --last` works after a restart, and the bell rings when Codex finishes — not yet verified on this PC.
