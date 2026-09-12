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
2. Click **+** next to "Workspaces". Walk down to the folder — it starts at the
   drives — or paste its path and press Enter, then **Add this folder**.
3. Hover the project, click **+**, and pick Claude Code or Codex.
4. Type your task into the panel's terminal.
5. The bell shows when an agent finishes or needs your input.

Anything that answers while you are looking somewhere else rings the bell — a
terminal on the Code tab, one of a named agent's threads, a chat. The tab it
came from gets a dot, and clicking the notification opens the very thing it is
about. Whatever is in front of you as it finishes never rings: you saw it.

The sidebar lists pinned folders first, then every other folder under
**Folders**. The canvas shows one workspace at a time: click a folder to open
it, or the chevron to fold its list of agents. Agents in other folders keep
running. The number beside a folder turns orange when an agent inside it is
waiting for you and grey when one has stopped, so a folded folder still says
what is going on in it. The card at the bottom shows who is signed in to the PC, how much is
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

## Finding something in a panel

An agent writes far more than fits on a screen. **Ctrl+F** inside a panel, or
**Find in output…** in its **...** menu, searches everything it has written:
every match is highlighted, the one you are on in yellow, and Enter and
Shift+Enter walk forwards and back. Escape closes it.

## Ctrl+K

One box that finds anything in the app: a folder, a terminal, a named agent, a
chat — and the handful of things worth starting. Type a few letters of the
name, in order but not necessarily next to each other (`sptg` finds "Spider
Tag"), and Enter goes there, switching tabs on the way if it has to. A folder's
name also finds everything working in that folder.

## Keyboard

| | |
|---|---|
| `Ctrl+K` | Go to anything |
| `Ctrl+1` `Ctrl+2` `Ctrl+3` | Agent, Code, Chat — even from inside a terminal |
| `Ctrl+B` | Show or hide the sidebar |
| `Ctrl+N` | New chat, or a new thread for the agent you are on |
| `Ctrl+F` | Find in the panel you are in |

The terminals get every other key, so nothing here is taken away from an agent.

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

- **+** next to Agents names one. Its folder is any folder on the disk —
  **Browse…** walks there, or paste the path — so an agent needs no workspace
  on the Code tab first. The instructions are appended to its system prompt, so
  they apply to everything it is ever asked.
- The pill by its name picks the model, the same three the Chat tab offers, and
  it can be changed later.
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

## Chat

The **Chat** tab is for the questions that come up while the agents work —
what a flag does, how to word a commit message, whether an approach is
sensible — so answering one does not mean leaving the window.

It has no folder. It cannot read a file and cannot run a command; the only
tools it has are web search and fetching a page, because half of what anyone
asks depends on something newer than the model. There is nothing to set up:
type the question and the chat is created on it, named after what you asked.

- **+** next to Chats, or **New chat** in the **...** menu, clears the screen
  for a new one. Nothing is created until you ask something, so the list never
  fills with empty chats.
- The pill beside the title picks the model: **Sonnet** for everyday questions,
  **Opus** when it needs thinking about, **Haiku** when the answer is small.
  Changing it carries on the same conversation.
- Enter sends, Shift+Enter starts a new line, and **Stop** abandons an answer.

Answers are shown as they were written — headings, lists, tables and code
blocks, each with a **Copy** button. Only `http`, `https` and `mailto`
addresses are ever clickable, and a link opens in your own browser.

Under each answer is a line saying what the turn took — how long, and how many
tokens went in and came back. Hovering it gives roughly what that is worth at
list price, which is not what a subscription is billed but is the honest way to
see the size of what you just asked for. Agent threads say the same.

Chats are saved with the rest of the state, so they are still there after the
window is closed, and each one carries on where it left off.

## Dark and Light

The button in the sidebar's account card switches between the two. It shows
where a click would take you: a sun on the dark theme, a moon on the light one.
The terminals change with the rest of the app, palette included — the usual
bright colours are invisible on white, so the light theme has its own sixteen.
The choice is kept in the browser, so it belongs to the window rather than to
the agents.

Both themes live in `shared/themes.js`, and they carry the whole palette: the
solid colours, and the translucent veils, rings and shadows every surface is
built from — those are white on dark and black on light, which is the part a
shelf of dark themes never needed. Nothing in `styles.css` names a colour of
its own; a test fails if anything starts to.

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
  their threads, chats):
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
- [ ] Chat → ask something → the answer arrives, formatted, and the chat is
      named after the question.
- [ ] Ask it to run a command → it says it has no way to.
- [ ] Ask a follow-up → it remembers the first question.
- [ ] Pick Opus, ask again → the answer still continues the same conversation.
- [ ] Reload → the tab, the chat and its whole transcript come back.
- [ ] Copy on a code block → the code is on the clipboard.
- [ ] Ask something, switch to Code before it answers → the bell badge goes up,
      the Chat tab shows a dot, and clicking the notification opens that chat.
- [ ] Sit on the chat while it answers → no badge, because you saw it.
- [ ] Ctrl+F in a busy panel → the bar opens, matches light up, Enter walks
      through them, and the agent never sees the keystroke.
- [ ] Ctrl+3 with the caret in a terminal → the Chat tab opens and the agent
      gets nothing (no stray Escape).
- [ ] Ctrl+K, type a few letters of a folder → Enter opens it on the Code tab.
- [ ] Ctrl+K, type part of a chat name → Enter opens that chat on the Chat tab.
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
- [ ] Switch to Light → the whole window turns, terminals included, and no
      corner of it stays dark. Switch back, reload → the choice is still there.
- [ ] Start a dev server, add a web pane, point it at it → the page shows, and
      Reload fetches it again.
- [ ] Close the window and open it again → the web pane comes back on the same
      address.
- [ ] Agent tab → **+** → name an agent, Browse… to a folder it has never seen,
      pick Haiku → it appears in the rail and its header says Haiku.
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
