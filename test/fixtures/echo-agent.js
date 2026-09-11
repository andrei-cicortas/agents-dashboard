// Fake agent for tests: sets a title, prints a ready line, echoes each input
// line back, and exits on "quit".
const sessionId = process.argv[2] ?? 'none';
process.stdout.write('\x1b]0;Fake agent title\x07');
process.stdout.write(`READY session=${sessionId} panel=${process.env.AGENTS_DASHBOARD_PANEL_ID}\r\n`);

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.search(/[\r\n]/);
  while (index !== -1) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (line === 'quit') process.exit(0);
    if (line !== '') process.stdout.write(`ECHO:${line}\r\n`);
    index = buffer.search(/[\r\n]/);
  }
});
