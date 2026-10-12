# Agents Dashboard

A desktop app for running several AI coding agents side by side, each in its
own real terminal and project folder. It currently supports **Claude Code**
and **Codex**, and has a chat and named agents of its own besides.

Windows 11 only, for now.

## Install

1. Install Claude Code and log in: run `claude` once in a terminal and follow
   the login. Codex is optional — `npm install -g @openai/codex`, then
   `codex login`.
2. Download `Agents-Dashboard-Setup-<version>.exe` from
   [Releases](https://github.com/AndreiNOG17/agents-dashboard/releases/latest)
   and run it. It installs for you alone, with no administrator rights, and
   puts **Agents Dashboard** on the desktop and in the Start menu.

The installer is not signed yet, so Windows may say *"Windows protected your
PC"*: click **More info**, then **Run anyway**. With Smart App Control turned
on, Windows does not run unsigned apps at all.

Nothing else is needed — no Node.js, no Git. The app updates itself: a new
version downloads in the background, and installs the next time you quit, or
straight away from **Restart to update** on the icon by the clock.

The folders, chats and agents you set up are kept per PC, so a second PC
starts empty.

## The window

- There is one window. Opening the app again brings it to the front.
- **Closing the window does not stop the agents.** The app stays by the clock
  with them still working; click its icon to bring the window back. The first
  time, a notification says so.
- Right-click that icon for **Quit**, which stops every agent (it asks first),
  and **Start with Windows**, which opens the app in the background when you
  sign in.
- It remembers its size, position, zoom and whether it was maximised.
- The title bar follows Dark and Light.
- When something new rings the bell while the window is hidden, minimised or
  behind others, its taskbar button flashes and Windows shows a notification.
  Clicking the notification opens the terminal, thread or chat it is about.
  They can be turned off like any app's, in Windows Settings → System →
  Notifications.
- The unread count shows as a red badge on the taskbar button.
- Questions such as "Stop this agent?" come up in the app's own dialogs, which
  Escape cancels and Enter confirms.
- Links open in your own browser. Ctrl+F, Ctrl+N and the other shortcuts belong
  to the app, not to a browser.
- **Stop all agents and close** quits the app.

## Daily use

1. Open **Agents Dashboard** from the desktop, Start or the taskbar.
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
- **Open in Explorer**, in a folder's or a panel's **...** menu, shows the
  folder an agent is working in — only ever a folder already on screen.
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
| `Ctrl+C` | In a terminal with text selected: copy it. With nothing selected it goes to the agent, as always |
| `Ctrl+V` | In a terminal: paste, as in Windows Terminal (`Ctrl+Shift+V` too). Dictation apps such as Wispr Flow put their text in this way |
| `Ctrl`+click | Open an address shown in a terminal, in your browser |

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
blocks. Hovering an answer gives a **Copy** that takes the whole thing as the
Markdown it was written in, and every code block has one of its own. Only
`http`, `https` and `mailto` addresses are ever clickable, and a link opens in
your own browser.

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
The choice is kept by the window rather than by the server, so it belongs to the
window rather than to the agents, and the title bar changes with it.

Both themes live in `shared/themes.js`, and they carry the whole palette: the
solid colours, and the translucent veils, rings and shadows every surface is
built from — those are white on dark and black on light, which is the part a
shelf of dark themes never needed. Nothing in `styles.css` names a colour of
its own; a test fails if anything starts to.

Closing the window does **not** stop the agents; click the icon by the clock to
see them again. **Settings** (the gear in the account card) stops all agents
and quits the app.

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

Add an entry to `config/agents.json` in the source and build the app again:

- `command`: the program to run (must be on PATH)
- `startArgs` / `resumeArgs`: arguments for a new session / for continuing one
- placeholders: `{sessionId}`, `{claudeHooksFile}`, `{codexNotify}`
- `installHint`: shown when the command is not installed
- `sessionSource`: `"codex"` for an agent that names its own session, so its id
  is read back after it starts rather than chosen in advance

## Where things are stored

- State (workspaces, panels, notifications, panel arrangements, agents and
  their threads, chats):
  `%APPDATA%\agents-dashboard\state.json`
- Logs: `%APPDATA%\agents-dashboard\server.log` and `server-error.log`
- The window's size, zoom and title bar colours: `%APPDATA%\agents-dashboard\window.json`
- The window's page engine data (the Dark/Light choice among it):
  `%LOCALAPPDATA%\agents-dashboard\electron`

Uninstalling the app leaves these alone, so a reinstall picks up where you
were. Delete the two folders to start from nothing.

## Troubleshooting

- **"Agents Dashboard is already running outside this app"**: a dashboard
  started some other way (`npm run server`, or the old PowerShell window) is
  using the same state. Stop it with Settings → Stop all agents and close.
- **A panel says the agent is not installed**: install it, then click Retry.
- **Claude Code panel asks to log in**: log in inside the panel, or run `claude` once in a normal terminal.
- **Nothing happens when opening the app**: it may already be running by the
  clock — look for its icon there. Otherwise check `server-error.log`.

## Building from source

Needs Node.js 24 or newer and Git.

```powershell
git clone https://github.com/AndreiNOG17/agents-dashboard.git
cd agents-dashboard
npm install
npm start          # the app, from the source
npm test
npm run dist       # the installer, in dist\
```

The app is an Electron window (`app/`) around a small Node.js server
(`server/`) that runs the agents in real terminals; the page itself is plain
ES modules in `web/` and `shared/`, with no build step. `npm run server` runs
the server alone, to open in a browser at http://127.0.0.1:4317.

F12 opens DevTools when the app runs from the source.

## Releasing a version

```powershell
npm version 0.3.0      # or: npm version patch
git push --follow-tags
```

The tag starts the Release workflow, which runs the tests, builds the
installer and attaches it to a **draft** release on GitHub. Publishing that
draft is what makes it the version people download, and the one every
installed copy updates itself to. Releases have to be public for that, which
means the repository has to be too.

## Trying the UI without real agents

```powershell
node test/fixtures/dev-setup.js
$env:DASHBOARD_DATA_DIR = "$PWD\test\.tmp\dev"
$env:DASHBOARD_AGENTS_FILE = "$PWD\test\.tmp\dev\agents.json"
$env:DASHBOARD_SERVER_PORT = "4318"
npm start
```

`DASHBOARD_DATA_DIR` gives the trial its own state, window and lock, so it
opens beside the real app and never touches it.

The "Test Agent" echoes what you type; type `notify` or `done` to ring the bell.

## Manual checklist (real agents)

- [ ] Run the installer → **Agents Dashboard** is on the desktop and in Start,
      and opens with the app's icon on the taskbar and no console window.
- [ ] Open it again while it is open → the same window comes to the front.
- [ ] Pin it from Start → the pinned icon and the open window are one button.
- [ ] Resize and move it, quit, open it again → same size and place.
- [ ] Switch to Light → the title bar turns light too.
- [ ] Click a link in a chat answer → it opens in the browser, not in the app.
- [ ] Minimise the window and let an agent finish → a Windows notification
      appears and the taskbar button shows a red count; click the
      notification → the window comes back on that agent.
- [ ] Close the window → a notification says the app is still running; the
      agents keep going, and clicking the icon by the clock brings it back.
- [ ] Right-click the icon → Quit → confirm → the app and every agent stop.
- [ ] Right-click the icon → Start with Windows, sign out and in → the app is
      by the clock without a window.
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
- [ ] Copy some text, click in a terminal, Ctrl+V → the text is at the agent's
      prompt. Dictate into the terminal with Wispr Flow → the words land there too.
- [ ] Ctrl+K, type a few letters of a folder → Enter opens it on the Code tab.
- [ ] Ctrl+K, type part of a chat name → Enter opens that chat on the Chat tab.
- [ ] A folder's **...** → Open in Explorer → the folder opens in a window.
- [ ] Hover an answer → Copy → it says Copied and pastes as Markdown.
- [ ] Split a panel right, then down → the three tile with no gaps.
- [ ] Drag a line between two panels → both resize, and neither can be dragged
      away to nothing.
- [ ] Close a panel → its space goes to its neighbour.
- [ ] Tidy → the panels square up into a grid.
- [ ] Add a second folder, start an agent in it, switch between the two → each
      folder keeps its own arrangement and the other agents keep running.
- [ ] Rearrange, close the window, open the app again → the arrangement
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
- [ ] Close the window, wait, open the app again → the panels are still there with their output.
- [ ] Settings → Stop all agents and close → confirm → "Dashboard stopped".
- [ ] Open the shortcut again → the panels come back and Claude continues its conversation.
- [ ] Leave Claude idle for more than 60 seconds after it finishes → the panel stays green (no "needs your input").
- [ ] Click into a Claude panel, close the window, let Claude finish, reopen → the bell badge shows 1.
- [ ] Reload the window with Claude open → no stray characters (like `[?1;2c`) appear in Claude's prompt box.
- [ ] Two Codex panels in one folder, each given something different to
      remember → after a restart each carries on its own conversation, not the
      same one twice.
