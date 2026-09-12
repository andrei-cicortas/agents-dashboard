// Turning what an agent says into the shape it was written in.
//
// Claude answers in Markdown — headings, lists, tables and fenced code — and
// showing that raw means reading `**this**` and counting backticks. This is a
// small parser for the subset that actually turns up in an answer.
//
// It produces plain data, never HTML. The browser builds elements from it with
// createElement and textContent, so nothing an agent writes can become markup.

const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBER = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

// Only addresses a person could have clicked anyway. Anything else — above all
// javascript: — is left as the text it was written as.
const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;

// ---- inline ---------------------------------------------------------------

// One pass over a line, longest and most specific markers first. Code spans win
// over everything, because inside backticks nothing else is a marker.
const INLINE_SOURCE = [
  '(`+)([^]*?)\\1',                        // `code`
  '\\*\\*([^]+?)\\*\\*',                   // **strong**
  '__([^]+?)__',                           // __strong__
  '~~([^]+?)~~',                           // ~~struck~~
  '\\*([^*\\n]+?)\\*',                     // *emphasis*
  '(?<![A-Za-z0-9_])_([^_\\n]+?)_(?![A-Za-z0-9_])', // _emphasis_
  '!?\\[([^\\]]*)\\]\\(([^()\\s]+)\\)',    // [text](href)
  '<((?:https?:\\/\\/|mailto:)[^>\\s]+)>', // <https://…>
  '(?<![\\w/])((?:https?:\\/\\/)[^\\s<>()\\[\\]]*[^\\s<>()\\[\\].,;:!?\'"])', // bare address
].join('|');

const text = (value) => ({ type: 'text', text: value });

export function parseSpans(line) {
  const source = String(line ?? '');
  const spans = [];
  let at = 0;
  // A scanner of its own each time: this walks a global regex and calls itself
  // for what it finds inside, and one shared regex would lose its place.
  const scanner = new RegExp(INLINE_SOURCE, 'g');
  for (let match = scanner.exec(source); match; match = scanner.exec(source)) {
    const [whole, , code, strongStar, strongBar, struck, emStar, emBar, linkText, href, angle, bare] = match;
    if (match.index > at) spans.push(text(source.slice(at, match.index)));
    at = match.index + whole.length;

    if (code !== undefined) spans.push({ type: 'code', text: code.trim() });
    else if (strongStar ?? strongBar) spans.push({ type: 'strong', spans: parseSpans(strongStar ?? strongBar) });
    else if (struck !== undefined) spans.push({ type: 'strike', spans: parseSpans(struck) });
    else if (emStar ?? emBar) spans.push({ type: 'em', spans: parseSpans(emStar ?? emBar) });
    else if (href !== undefined) {
      // An image is written like a link with a bang; the dashboard shows no
      // pictures, so it reads as its own words rather than vanishing.
      if (SAFE_LINK.test(href) && !whole.startsWith('!')) spans.push({ type: 'link', href, spans: parseSpans(linkText || href) });
      else spans.push(text(linkText || href));
    } else if (angle) spans.push({ type: 'link', href: angle, spans: [text(angle)] });
    else if (bare) spans.push({ type: 'link', href: bare, spans: [text(bare)] });
  }
  if (at < source.length) spans.push(text(source.slice(at)));
  return spans.length ? spans : [text('')];
}

// ---- blocks ---------------------------------------------------------------

const indentOf = (value) => value.replace(/\t/g, '  ').match(/^ */)[0].length;
const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => parseSpans(cell.trim()));

// A run of list lines, which may hold lines indented under an item.
function parseList(lines, start, ordered) {
  const items = [];
  const marker = ordered ? NUMBER : BULLET;
  const first = lines[start].match(marker);
  const baseIndent = indentOf(first[1]);
  let at = start;

  while (at < lines.length) {
    const match = lines[at].match(marker);
    const other = lines[at].match(ordered ? BULLET : NUMBER);
    // A different kind of marker at this level starts a list of its own.
    if (!match || indentOf(match[1]) < baseIndent || (other && indentOf(other[1]) === baseIndent)) break;
    if (indentOf(match[1]) > baseIndent) break;

    const own = [ordered ? match[3] : match[2]];
    at += 1;
    // Everything indented further belongs to this item, nested list included.
    while (at < lines.length && lines[at].trim() && indentOf(lines[at]) > baseIndent) {
      own.push(lines[at].slice(Math.min(indentOf(lines[at]), baseIndent + 2)));
      at += 1;
    }
    const [lead, ...rest] = own;
    items.push({ spans: parseSpans(lead), blocks: rest.length ? parseBlocks(rest.join('\n')) : [] });
  }
  return { block: { type: 'list', ordered, items }, next: at };
}

export function parseBlocks(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let at = 0;

  const paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', spans: parseSpans(paragraph.join('\n')) });
    paragraph.length = 0;
  };

  while (at < lines.length) {
    const line = lines[at];

    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const closing = new RegExp(`^ {0,3}\\${fence[1][0]}{${fence[1].length},}\\s*$`);
      const body = [];
      at += 1;
      while (at < lines.length && !closing.test(lines[at])) {
        body.push(lines[at]);
        at += 1;
      }
      at += 1; // the closing fence, or the end of the text
      blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flush();
      at += 1;
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ type: 'rule' });
      at += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, spans: parseSpans(heading[2].trim()) });
      at += 1;
      continue;
    }

    // A table is a header row only if the line under it is the ---|--- rule.
    const under = lines[at + 1] ?? '';
    if (line.includes('|') && under.includes('|') && under.includes('-') && TABLE_RULE.test(under)) {
      flush();
      const head = cells(line);
      at += 2;
      const rows = [];
      while (at < lines.length && lines[at].includes('|') && lines[at].trim()) {
        rows.push(cells(lines[at]));
        at += 1;
      }
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      flush();
      const body = [];
      while (at < lines.length && lines[at].match(QUOTE)) {
        body.push(lines[at].match(QUOTE)[1]);
        at += 1;
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(body.join('\n')) });
      continue;
    }

    const bullet = line.match(BULLET);
    const number = line.match(NUMBER);
    if (bullet || number) {
      flush();
      const { block, next } = parseList(lines, at, Boolean(number));
      blocks.push(block);
      at = next;
      continue;
    }

    paragraph.push(line);
    at += 1;
  }
  flush();
  return blocks;
}
