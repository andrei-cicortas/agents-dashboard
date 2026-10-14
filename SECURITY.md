# Security

Agents Dashboard runs coding agents that can read and change files on your
computer, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/andrei-cicortas/agents-dashboard/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do
with it. You will get an answer within a few days.

## What the app does to stay safe

- Its server listens on `127.0.0.1` only, checks the `Host` header (against
  DNS rebinding) and the WebSocket `Origin` (against other websites).
- Agents report back with a secret token made fresh on every start.
- Named agents can only read files unless you give them more, explicitly.
- The window is sandboxed, with no Node.js in the page.

More in [docs/architecture.md](docs/architecture.md#security).

## Supported versions

Only the latest release gets fixes. The app updates itself, so staying on it
needs nothing from you.
