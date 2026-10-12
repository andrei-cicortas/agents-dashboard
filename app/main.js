// Where the desktop app starts.
//
// Started with --hook it is not the app at all but the hook client that agents
// run when they finish or need input (server/hook-client.js): an installed copy
// has no separate node.exe to run that with, so it runs it itself.

const hookAt = process.argv.indexOf('--hook');

if (hookAt !== -1) {
  const { main } = await import('../server/hook-client.js');
  await main(process.argv.slice(hookAt + 1));
} else {
  await import('./desktop.js');
}
