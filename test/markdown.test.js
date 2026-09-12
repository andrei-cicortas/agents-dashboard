import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseSpans } from '../shared/markdown.js';

const plain = (spans) => spans.map((span) => (span.type === 'text' ? span.text : `<${span.type}>`)).join('');

test('plain words are one paragraph', () => {
  assert.deepEqual(parseBlocks('hello there'), [
    { type: 'paragraph', spans: [{ type: 'text', text: 'hello there' }] },
  ]);
});

test('a blank line ends a paragraph and starts the next', () => {
  const blocks = parseBlocks('one\n\ntwo');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].spans[0].text, 'two');
});

test('lines of the same paragraph stay together', () => {
  const blocks = parseBlocks('one\ntwo');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].spans[0].text, 'one\ntwo');
});

test('a fenced block keeps its code exactly, and says what language it is', () => {
  const blocks = parseBlocks('before\n\n```js\nconst a = 1;\n  indented\n```\n\nafter');
  assert.deepEqual(blocks[1], { type: 'code', lang: 'js', text: 'const a = 1;\n  indented' });
  assert.equal(blocks[2].spans[0].text, 'after');
});

test('markers inside a fence are code, not formatting', () => {
  const blocks = parseBlocks('```\n**not bold** and `not code`\n```');
  assert.equal(blocks[0].text, '**not bold** and `not code`');
});

test('a fence nobody closed still ends at the end of the text', () => {
  const blocks = parseBlocks('```\nstill code');
  assert.deepEqual(blocks, [{ type: 'code', lang: '', text: 'still code' }]);
});

test('a fence with no language says so rather than guessing one', () => {
  assert.equal(parseBlocks('```\nx\n```')[0].lang, '');
});

test('headings carry their level', () => {
  const blocks = parseBlocks('# One\n### Three');
  assert.deepEqual(blocks.map((block) => [block.type, block.level]), [['heading', 1], ['heading', 3]]);
  assert.equal(blocks[0].spans[0].text, 'One');
});

test('a bulleted list becomes one block of items', () => {
  const blocks = parseBlocks('- first\n- second');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'list');
  assert.equal(blocks[0].ordered, false);
  assert.deepEqual(blocks[0].items.map((item) => plain(item.spans)), ['first', 'second']);
});

test('a numbered list is marked as one', () => {
  const blocks = parseBlocks('1. first\n2. second');
  assert.equal(blocks[0].ordered, true);
  assert.equal(blocks[0].items.length, 2);
});

test('a list indented under an item is kept inside it', () => {
  const [list] = parseBlocks('- outer\n  - inner\n- next');
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].blocks[0].type, 'list');
  assert.equal(plain(list.items[0].blocks[0].items[0].spans), 'inner');
});

test('a bulleted list after a numbered one is a list of its own', () => {
  const blocks = parseBlocks('1. one\n- two');
  assert.deepEqual(blocks.map((block) => block.ordered), [true, false]);
});

test('a quote holds blocks of its own', () => {
  const [quote] = parseBlocks('> quoted words\n> - and a list');
  assert.equal(quote.type, 'quote');
  assert.deepEqual(quote.blocks.map((block) => block.type), ['paragraph', 'list']);
});

test('three dashes are a rule', () => {
  assert.deepEqual(parseBlocks('a\n\n---\n\nb').map((block) => block.type), ['paragraph', 'rule', 'paragraph']);
});

test('a table keeps its heading row apart from its rows', () => {
  const [table] = parseBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');
  assert.equal(table.type, 'table');
  assert.deepEqual(table.head.map(plain), ['a', 'b']);
  assert.deepEqual(table.rows.map((row) => row.map(plain)), [['1', '2'], ['3', '4']]);
});

test('a line with a pipe but no rule under it is only a paragraph', () => {
  assert.equal(parseBlocks('a | b\nnot a rule')[0].type, 'paragraph');
});

test('bold, italic, struck and code are read as themselves', () => {
  assert.deepEqual(parseSpans('a **b** c *d* e `f` g ~~h~~').map((span) => span.type),
    ['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'strike']);
});

test('underscores inside a word are not emphasis', () => {
  assert.deepEqual(parseSpans('some_long_name'), [{ type: 'text', text: 'some_long_name' }]);
});

test('nothing inside a code span is a marker', () => {
  const [span] = parseSpans('`**a**`');
  assert.deepEqual(span, { type: 'code', text: '**a**' });
});

test('a link keeps its words and its address', () => {
  const [span] = parseSpans('[the docs](https://example.com/x)');
  assert.equal(span.type, 'link');
  assert.equal(span.href, 'https://example.com/x');
  assert.equal(plain(span.spans), 'the docs');
});

test('an address written on its own is still a link', () => {
  const spans = parseSpans('see https://example.com now');
  assert.equal(spans[1].type, 'link');
  assert.equal(spans[1].href, 'https://example.com');
});

test('a full stop after an address is not part of it', () => {
  const spans = parseSpans('go to https://example.com/a.');
  assert.equal(spans[1].href, 'https://example.com/a');
  assert.equal(spans[2].text, '.');
});

test('a link that could run code is shown as words, never as a link', () => {
  const spans = parseSpans('[click](javascript:doom)');
  assert.deepEqual(spans, [{ type: 'text', text: 'click' }]);
});

test('a file on the disk is not something to click either', () => {
  const spans = parseSpans('[open](file:///C:/Windows)');
  assert.ok(spans.every((span) => span.type !== 'link'), JSON.stringify(spans));
});

test('an image is read as its words, because the dashboard shows no pictures', () => {
  const spans = parseSpans('![a cat](https://example.com/cat.png)');
  assert.deepEqual(spans, [{ type: 'text', text: 'a cat' }]);
});

test('emphasis inside bold is kept', () => {
  const [span] = parseSpans('**very *very* bold**');
  assert.equal(span.type, 'strong');
  assert.deepEqual(span.spans.map((inner) => inner.type), ['text', 'em', 'text']);
});

test('nothing at all is nothing to draw', () => {
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseBlocks(null), []);
});

test('Windows line endings read the same as any other', () => {
  assert.deepEqual(parseBlocks('a\r\n\r\nb').map((block) => block.spans[0].text), ['a', 'b']);
});
