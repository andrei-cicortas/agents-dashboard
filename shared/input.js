// Telling a person typing apart from the terminal answering by itself.
//
// An agent asks the terminal questions on startup — what kind are you, where is
// the cursor, do you have focus — and the terminal answers without anyone
// touching the keyboard. Those answers arrive by the same route as keystrokes,
// so anything that decides whether a panel has been used has to know the
// difference; otherwise every panel looks used the moment it is opened.

// The replies a terminal sends unprompted. Arrow keys are escape sequences too,
// but they are not on this list, so pressing one still counts as typing.
const TERMINAL_REPLY = /^(?:\x1b\[(?:[IO]|[?>][0-9;]*c|[0-9]+;[0-9]+R|[0-9]*n))+$/;

export function looksTyped(data) {
  if (typeof data !== 'string' || data === '') return false;
  return !TERMINAL_REPLY.test(data);
}
