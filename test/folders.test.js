import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listFolders } from '../server/folders.js';

let counter = 0;
function tree(shape) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `folders-${counter += 1}-`));
  for (const [name, kind] of Object.entries(shape)) {
    const full = path.join(root, name);
    if (kind === 'dir') fs.mkdirSync(full);
    else fs.writeFileSync(full, 'x');
  }
  return root;
}

test('with no path it offers the drives, so This PC is the starting point', () => {
  const listed = listFolders({});
  assert.equal(listed.parent, null);
  assert.ok(listed.entries.length > 0, 'a Windows PC has at least one drive');
  assert.ok(listed.entries.every((entry) => /^[A-Z]:\\$/.test(entry.path)), JSON.stringify(listed.entries));
});

test('a folder lists the folders inside it', () => {
  const root = tree({ src: 'dir', build: 'dir', 'notes.txt': 'file' });
  const listed = listFolders({ path: root });
  assert.deepEqual(listed.entries.map((entry) => entry.name), ['build', 'src']);
  assert.equal(listed.entries[0].path, path.join(root, 'build'));
});

test('files are not folders, so they are left out', () => {
  const root = tree({ 'a.txt': 'file', 'b.txt': 'file' });
  assert.deepEqual(listFolders({ path: root }).entries, []);
});

test('it says where up leads, so the list can be walked back', () => {
  const root = tree({ inner: 'dir' });
  const listed = listFolders({ path: path.join(root, 'inner') });
  assert.equal(listed.parent, root);
});

test('the top of a drive has the drives above it, not nothing', () => {
  const listed = listFolders({ path: 'C:\\' });
  assert.equal(listed.parent, null);
  assert.equal(listed.path, 'C:\\');
});

test('a path that is not there is reported rather than thrown', () => {
  const listed = listFolders({ path: 'C:\\definitely not a folder here' });
  assert.equal(listed.error, 'That folder does not exist.');
  assert.deepEqual(listed.entries, []);
});

test('a file is not something to browse into', () => {
  const root = tree({ 'a.txt': 'file' });
  const listed = listFolders({ path: path.join(root, 'a.txt') });
  assert.equal(listed.error, 'That is a file, not a folder.');
});

test('a folder it may not read says so instead of ending the server', () => {
  const listed = listFolders({
    path: 'C:\\somewhere',
    fs: {
      statSync: () => ({ isDirectory: () => true }),
      readdirSync: () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); },
    },
  });
  assert.equal(listed.error, 'That folder cannot be opened.');
  assert.deepEqual(listed.entries, []);
});

test("Windows' own bookkeeping folders are left out, so the real ones are on top", () => {
  const root = tree({ '$Recycle.Bin': 'dir', 'System Volume Information': 'dir', Projects: 'dir' });
  assert.deepEqual(listFolders({ path: root }).entries.map((e) => e.name), ['Projects']);
});

test('entries come back in the order a person reads them', () => {
  const root = tree({ Zebra: 'dir', apple: 'dir', Mango: 'dir' });
  assert.deepEqual(listFolders({ path: root }).entries.map((e) => e.name), ['apple', 'Mango', 'Zebra']);
});
