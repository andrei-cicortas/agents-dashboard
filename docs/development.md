# Development

Building, running and releasing the app from its source. How it is put together is in [architecture.md](architecture.md).

## Building from source

Needs Node.js 24 or newer and Git.

```powershell
git clone https://github.com/andrei-cicortas/agents-dashboard.git
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
