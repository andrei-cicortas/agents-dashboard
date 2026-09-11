// Fake agent for tests: exits immediately with the given code.
process.exit(Number(process.argv[2] ?? 3));
