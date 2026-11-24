// Mermaid flowchart <-> marmerlade Diagram interop.
//
// We read the Mermaid flowchart grammar people write by hand or paste in:
//   - node declarations in every classic bracket shape (see src/shapes.ts):
//       A[Rect]  B(Round)  C([Stadium])  D[[Sub]]  E[(Database)]  F((Circle))
//       G(((Double)))  H{Diamond}  I{{Hexagon}}  J[/Lean/]  K[\Lean\]
//       L[/Trap\]  M[\Trap/]  N>Flag]
//   - v11 shape/icon metadata:  A@{ shape: cyl, label: "DB" }
//                              B@{ icon: "simple-icons:github", form: "square", label: "GitHub" }
//                              C@{ img: "https://…/logo.png", label: "Logo", pos: "t", w: 60, h: 60, constraint: "on" }
//   - links of any length and kind: --> --- -.-> ==> ~~~ --o --x <--> o--o,
//     labelled as `-->|text|` or `-- text -->`, chained (A --> B --> C), grouped
//     with `&`, and named (`A e1@--> B` with `e1@{ animate: true }`)
//   - subgraphs:  subgraph Title ... end   (become collapsible group nodes)
//   - styling: classDef / class / A:::cls / style / linkStyle, mapped onto
//     marmerlade's ElementStyle where it has an equivalent
//   - statements split by `;`, YAML frontmatter, %% comments and %%{init}%%,
//     accTitle / accDescr, `direction`, and click handlers
//
// This is a pragmatic parser, not a full mermaid grammar: what has no
// marmerlade equivalent (layout direction, external click targets, invisible
// links, circle / cross arrowheads) is read and dropped, never rejected.
// Everything marmerlade emits is checked against the real mermaid parser by
// scripts/mermaid-compat.ts, and the syntax above by scripts/mermaid-syntax.ts.

import type { Arrowheads, Diagram, DiagramEdge, DiagramNode, ElementStyle, FontFamily, NodeImage, NodeShape } from '../types';
import { SHAPES, SHAPE_ALIAS, iconForm, shapeDef, shapeForForm } from '../shapes.ts';
import { parsePageIds } from '../pages.ts';

interface ParsedNode {
  id: string;
  label: string;
  shape: NodeShape;
  parentId: string | null;
  icon?: string;
  image?: NodeImage;
  /** classes attached inline with `A:::cls` */
  classes?: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * A Mermaid node id as written. Mermaid also allows `-` and `.` between word
 * characters (`my-node`, `a.b`); those are renamed on import (see `idOf`),
 * since marmerlade ids are plain word characters.
 */
const RAW_ID = '[A-Za-z0-9_]+(?:[-.][A-Za-z0-9_]+)*';
const RAW_ID_RE = new RegExp(`^${RAW_ID}$`);

// longest opening delimiter first, so `(((` wins over `((` and `[(` over `[`
const SHAPE_PATTERNS: Array<{ re: RegExp; shape: NodeShape }> = [...SHAPES]
  .sort((a, b) => b.open.length - a.open.length)
  .map(({ open, close, shape }) => ({
    re: new RegExp(`^(${RAW_ID})${escapeRe(open)}(.+?)${escapeRe(close)}$`),
    shape,
  }));

/** `id@{ key: value, ... }` (Mermaid v11 shape / icon metadata, or edge metadata) */
const META_RE = new RegExp(`^(${RAW_ID})\\s*@\\{(.*)\\}$`);
const META_PAIR_RE = /([A-Za-z]+)\s*:\s*("(?:[^"\\]|\\.)*"|[^,]*)/g;

/** Where a node's wiki page lives; shared by the `click` emitter and parser. */
export const PAGE_HREF = '#/wiki/';
// any base is accepted on import (relative, absolute, another host): the page
// id is whatever follows `#/wiki/`
const CLICK_RE = new RegExp(`^click\\s+(${RAW_ID})\\s+href\\s+"[^"#]*#\\/wiki\\/([^"?]+)(?:\\?[^"\\n]*)?"`);
/** any other click handler: an external URL, a callback, `call fn()` */
const OTHER_CLICK_RE = new RegExp(`^click\\s+${RAW_ID}\\s+\\S`);

let pageBase = '';

/**
 * URL the exported page links hang off, e.g. `https://notes.example/app/`.
 * Empty keeps them relative (`#/wiki/<id>`). Any fragment on it is dropped.
 */
export function setPageBase(base: string) {
  pageBase = base.trim().replace(/#.*$/, '');
}

export const pageLink = (pageId: string) => `${pageBase}${PAGE_HREF}${encodeURIComponent(pageId)}`;

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/** Mermaid's named entity codes (`#quot;`) that labels commonly use. */
const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ', num: '#' };

function decodeEntities(s: string): string {
  return s
    .replace(/#(\d+);/g, (m, n: string) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/#([A-Za-z]+);/g, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * A label as written (quotes already stripped) to the plain text marmerlade
 * shows: a markdown string (`` `**bold** text` ``) loses its backticks and
 * emphasis markers, `<br/>` becomes a line break and entity codes decode.
 */
function decodeLabel(label: string): string {
  let s = label;
  const md = /^`([\s\S]*)`$/.exec(s);
  if (md) s = md[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  return decodeEntities(s.replace(/<br\s*\/?\s*>/gi, '\n'));
}

/**
 * The inverse of `decodeLabel`, for export: a quote would end the label and a
 * `#…;` would read back as an entity, so both are written as entity codes.
 */
function encodeLabel(label: string): string {
  return label
    .replace(/#(?=\w+;)/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/\r?\n/g, '<br/>');
}

const positiveNum = (v: string | undefined): number | undefined => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : undefined;
};

function parseImage(meta: Record<string, string>): NodeImage {
  const image: NodeImage = { src: meta.img.trim() };
  const pos = meta.pos?.trim();
  if (pos === 't' || pos === 'b') image.pos = pos;
  const w = positiveNum(meta.w);
  const h = positiveNum(meta.h);
  if (w) image.w = w;
  if (h) image.h = h;
  if (meta.constraint?.trim() === 'on') image.constraint = true;
  return image;
}

function parseMetaPairs(body: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const m of body.matchAll(META_PAIR_RE)) meta[m[1]] = stripQuotes(m[2]);
  return meta;
}

function parseMeta(id: string, body: string, parentId: string | null): ParsedNode {
  const meta = parseMetaPairs(body);
  if (meta.img) {
    // like mermaid, an image node without a label shows no text
    return { id, label: decodeLabel(meta.label ?? ''), shape: 'rect', parentId, image: parseImage(meta) };
  }
  const label = decodeLabel(meta.label ?? id);
  if (meta.icon) {
    return { id, label, shape: shapeForForm(meta.form), parentId, icon: meta.icon };
  }
  // shapes we don't draw yet still import, as rectangles
  const shape = SHAPE_ALIAS.get((meta.shape ?? 'rect').trim()) ?? 'rect';
  return { id, label, shape, parentId };
}

function parseNodeToken(
  token: string,
  parentId: string | null,
  idOf: (raw: string) => string,
): ParsedNode | null {
  let t = token.trim();
  // inline class: `A:::hot`, `A["x"]:::hot`
  const cls = /^(.+?):::([A-Za-z0-9_-]+)$/.exec(t);
  if (cls) t = cls[1].trim();
  const node = parseNodeBody(t, parentId, idOf);
  if (node && cls) node.classes = [cls[2]];
  return node;
}

function parseNodeBody(t: string, parentId: string | null, idOf: (raw: string) => string): ParsedNode | null {
  const meta = t.match(META_RE);
  if (meta) return parseMeta(idOf(meta[1]), meta[2], parentId);
  for (const { re, shape } of SHAPE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      // a blank `" "` is how an unlabelled node is written (see shapeWrap)
      const label = decodeLabel(stripQuotes(m[2]));
      return { id: idOf(m[1]), label: label.trim() === '' ? '' : label, shape, parentId };
    }
  }
  // bare id reference (e.g. just `A`)
  if (RAW_ID_RE.test(t)) {
    const id = idOf(t);
    return { id, label: id, shape: 'rect', parentId };
  }
  return null;
}

// ---- links ----

/** How a link's line is drawn: `-->` solid, `-.->` dotted, `==>` thick. */
type LineKind = 'solid' | 'dotted' | 'thick';

/** Edges at least this wide export as Mermaid's thick `==>` links. */
export const THICK_WIDTH = 2;

/** The Mermaid line kind an edge style draws as (dashed and dotted are both `-.->`). */
function lineKind(style: ElementStyle | undefined): LineKind {
  if (style?.strokeStyle === 'dashed' || style?.strokeStyle === 'dotted') return 'dotted';
  return (style?.strokeWidth ?? 1) >= THICK_WIDTH ? 'thick' : 'solid';
}

const lineStyle = (kind: LineKind): ElementStyle =>
  kind === 'dotted' ? { strokeStyle: 'dotted' } : kind === 'thick' ? { strokeWidth: THICK_WIDTH } : {};

interface Link {
  /** characters the link takes, its `|label|` included */
  len: number;
  label?: string;
  arrowheads: Arrowheads;
  /** `invisible` is `~~~`: it only steers mermaid's layout, so it makes no edge */
  line: LineKind | 'invisible';
}

// circle / cross heads (`--o`, `--x`) must not run into a node id, the way
// mermaid itself reads `A --oB` as `A --o B` only when spaced
const END_HEAD = '(?:>|[ox](?=[\\s|]|$))';
const LINK_RE = new RegExp(
  `^([<ox])?(?:(-{2,}${END_HEAD}|-{3,})|(={2,}${END_HEAD}|={3,})|(-\\.+-${END_HEAD}?)|(~{3,}))`,
);
/** the opening of a link with its text inline: `-- text -->`, `-. text .->`, `== text ==>` */
const TEXT_OPEN_RE = /^([<ox])?(--|==|-\.)(?=\s)/;
const TEXT_CLOSE_RE: Record<string, RegExp> = {
  '--': new RegExp(`\\s(-{2,}${END_HEAD}|-{3,})`),
  '==': new RegExp(`\\s(={2,}${END_HEAD}|={3,})`),
  '-.': new RegExp(`\\s(\\.+-${END_HEAD}?)`),
};
const PIPE_LABEL_RE = /^[ \t]*\|([^|]+)\|/;
const hasEndHead = (body: string) => /[>ox]$/.test(body);

/** The link starting at `line[i]`, or null when there is none. */
function matchLink(line: string, i: number): Link | null {
  const c = line[i];
  if (!'-=<~ox'.includes(c)) return null;
  // `o` / `x` are only heads when they start a word (`A o--o B`), never inside an id
  if ((c === 'o' || c === 'x') && !/\s/.test(line[i - 1] ?? '')) return null;
  const rest = line.slice(i);
  let start: string | undefined;
  let end: boolean;
  let kind: Link['line'];
  let label: string | undefined;
  let len: number;
  const m = LINK_RE.exec(rest);
  if (m) {
    const [whole, head, solid, thick, dotted, invisible] = m;
    start = head;
    kind = solid ? 'solid' : thick ? 'thick' : dotted ? 'dotted' : 'invisible';
    end = !invisible && hasEndHead(solid ?? thick ?? dotted);
    len = whole.length;
    const pipe = PIPE_LABEL_RE.exec(rest.slice(len));
    if (pipe) {
      label = pipe[1];
      len += pipe[0].length;
    }
  } else {
    const open = TEXT_OPEN_RE.exec(rest);
    if (!open) return null;
    const after = rest.slice(open[0].length);
    // quoted text may itself hold an arrow: look for the close after the quote
    const quote = /^\s*"[^"]*"/.exec(after);
    const from = quote ? quote[0].length : 0;
    const close = TEXT_CLOSE_RE[open[2]].exec(after.slice(from));
    if (!close) return null;
    close.index += from;
    start = open[1];
    kind = open[2] === '--' ? 'solid' : open[2] === '==' ? 'thick' : 'dotted';
    end = hasEndHead(close[1]);
    label = after.slice(0, close.index);
    len = open[0].length + close.index + close[0].length;
  }
  const text = label === undefined ? '' : decodeLabel(stripQuotes(label));
  return {
    len,
    label: text.trim() ? text : undefined,
    arrowheads: start ? (end ? 'both' : 'start') : end ? 'end' : 'none',
    line: kind,
  };
}

const OPENERS = '[({';
const CLOSERS = '])}';

/**
 * Cut `text` at every top-level occurrence of a separator found by `match`
 * (which returns the separator's length at index `i`, or 0). Quotes and
 * brackets hide separators, so `A["x --> y"]` and `A[R&D]` stay whole.
 */
function splitTop(text: string, match: (i: number) => number): { parts: string[]; seps: number[] } {
  const parts: string[] = [];
  const seps: number[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    if (quoted || c === '"') continue;
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const len = match(i);
      if (!len) continue;
      parts.push(text.slice(start, i).trim());
      seps.push(i);
      i += len - 1;
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return { parts, seps };
}

/** `A e1@` before a link: the link is named `e1` */
const EDGE_ID_RE = new RegExp(`^(.*\\S)\\s+(${RAW_ID})@$`);

/**
 * Split an edge line into steps. `A --> B -->|x| C` gives steps `[A] [B] [C]`
 * and one link per hop; `A & B --> C` gives `[A, B] [C]`, where `&` groups
 * nodes that share a hop. Each hop links every node of one step to every node
 * of the next. Returns null when the line holds no link or a node is missing.
 */
function splitChain(line: string): { steps: string[][]; links: Link[]; edgeIds: (string | undefined)[] } | null {
  const links: Link[] = [];
  const { parts } = splitTop(line, (i) => {
    const link = matchLink(line, i);
    if (!link) return 0;
    links.push(link);
    return link.len;
  });
  if (links.length === 0) return null;
  const edgeIds = links.map((_, k) => {
    const named = EDGE_ID_RE.exec(parts[k]);
    if (!named) return undefined;
    parts[k] = named[1];
    return named[2];
  });
  const steps = parts.map((p) => splitTop(p, (i) => (p[i] === '&' ? 1 : 0)).parts);
  return steps.every((s) => s.every(Boolean)) ? { steps, links, edgeIds } : null;
}

/**
 * Split a source line into statements at top-level `;`. Quotes, brackets and
 * `|link labels|` hide a `;`, and so does the one closing an entity (`#quot;`).
 */
function splitStatements(line: string): string[] {
  // style statements keep their `;`: mermaid drops a trailing one, and a color
  // like `#f9f;` would otherwise read as an entity code
  if (/^(style|classDef|linkStyle|class)\s/.test(line)) return [line.replace(/;+\s*$/, '')];
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let piped = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !piped) quoted = !quoted;
    else if (quoted) continue;
    else if (c === '|') piped = !piped;
    else if (piped) continue;
    else if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0 && !/#\w+$/.test(line.slice(start, i))) {
      out.push(line.slice(start, i));
      start = i + 1;
    }
  }
  out.push(line.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// ---- styling ----

const COLOR_RE = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(rgb|rgba|hsl|hsla)\([^)]*\)|[a-z]+)$/i;
const cssNumber = (v: string): number | undefined => {
  const m = /^(\d*\.?\d+)(px)?$/.exec(v);
  return m ? Number(m[1]) : undefined;
};

function cssFont(v: string): FontFamily {
  const f = v.toLowerCase();
  if (f.includes('mono') || f.includes('courier')) return 'mono';
  if (f.includes('serif') && !f.includes('sans')) return 'serif';
  return 'sans';
}

/**
 * Mermaid's CSS-like style list (`fill:#f9f,stroke:#333,stroke-width:4px`)
 * mapped onto the ElementStyle fields marmerlade has. Anything else (and any
 * value that is not yet a whole color or number, as while typing) is skipped.
 */
function parseStyleList(spec: string): ElementStyle {
  const style: ElementStyle = {};
  for (const part of splitTop(spec, (i) => (spec[i] === ',' ? 1 : 0)).parts) {
    const m = /^([a-z-]+)\s*:\s*(.+)$/i.exec(part);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].replace(/\s*!important$/, '').trim();
    const num = cssNumber(value);
    switch (key) {
      case 'fill':
        if (value === 'none') style.background = 'transparent';
        else if (COLOR_RE.test(value)) style.background = value;
        break;
      case 'stroke':
        if (COLOR_RE.test(value)) style.stroke = value;
        break;
      case 'color':
        if (COLOR_RE.test(value)) style.fontColor = value;
        break;
      case 'stroke-width':
        if (num !== undefined) style.strokeWidth = num;
        break;
      case 'stroke-dasharray': {
        const dash = Number.parseFloat(value);
        if (value === 'none' || dash === 0) style.strokeStyle = 'solid';
        else if (dash > 0) style.strokeStyle = dash <= 2 ? 'dotted' : 'dashed';
        break;
      }
      case 'opacity':
        if (num !== undefined && num <= 1) style.opacity = num;
        break;
      case 'font-size':
        if (num) style.fontSize = num;
        break;
      case 'font-family':
        style.fontFamily = cssFont(value);
        break;
      case 'animation':
        // mermaid's animated-edge recipe: `animation: dash 25s linear infinite`
        if (value !== 'none') style.animation = 'flow';
        break;
    }
  }
  return style;
}

/** `e1@{ animate: true, animation: fast }` on a named edge */
function edgeMetaStyle(body: string): ElementStyle {
  const meta = parseMetaPairs(body);
  const style: ElementStyle = {};
  if (meta.animate === 'true') style.animation = 'flow';
  else if (meta.animate === 'false') style.animation = 'none';
  const speed = meta.animation?.trim();
  if (speed === 'fast' || speed === 'slow') {
    style.animation = 'flow';
    style.animationSpeed = speed === 'fast' ? 0.8 : 3;
  }
  return style;
}

const isEmpty = (s: ElementStyle) => Object.keys(s).length === 0;

/** `style` with its undefined fields removed, so it compares and saves cleanly. */
function clean(style: ElementStyle): ElementStyle {
  return Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined)) as ElementStyle;
}

/** A line that the parser could not make sense of, for `parseMermaid`. */
export interface ParseIssue {
  /** 0-based line index within the source */
  line: number;
  /** the offending line text (trimmed) */
  text: string;
  reason: string;
}

interface CoreResult {
  diagram: Diagram;
  issues: ParseIssue[];
  /** number of non-blank, non-comment lines seen (excludes the header) */
  meaningfulLines: number;
}

/**
 * The shared parse core. Walks the source once and records, per line, whether
 * it matched a known construct. `fromMermaid` ignores the issue list (lenient);
 * `parseMermaid` uses it to reject text that does not parse cleanly.
 */
function parseCore(src: string): CoreResult {
  // keep original line indices so issues point at the right row in the editor
  const rawLines = src.split('\n');

  const nodeMap = new Map<string, ParsedNode>();
  const edges: DiagramEdge[] = [];
  /** every mermaid link in order, for `linkStyle <index>`; null for `~~~` */
  const links: (DiagramEdge | null)[] = [];
  const namedEdges = new Map<string, DiagramEdge[]>();
  const subgraphStack: string[] = [];
  const subgraphIds = new Set<string>();
  const issues: ParseIssue[] = [];
  const pageIds = new Map<string, string>();
  const pageLists = new Map<string, string[]>();
  const deckLists = new Map<string, string[]>();
  const classDefs = new Map<string, ElementStyle>();
  const nodeClasses = new Map<string, string[]>();
  const nodeStyles = new Map<string, ElementStyle>();
  const linkStyles: Array<{ line: number; text: string; targets: number[] | 'default'; style: ElementStyle }> = [];
  let edgeSeq = 0;
  let meaningfulLines = 0;
  let untitled = 0;

  // `my-node` / `a.b` become `my_node` / `a_b`, numbered past any id already
  // written that way, so every spelling keeps its own node
  const words = new Set(src.match(/[A-Za-z0-9_]+/g) ?? []);
  const renamed = new Map<string, string>();
  const taken = new Set<string>();
  const idOf = (raw: string): string => {
    if (!/[-.]/.test(raw)) return raw;
    const known = renamed.get(raw);
    if (known) return known;
    const base = raw.replace(/[-.]/g, '_');
    let id = base;
    for (let n = 2; words.has(id) || taken.has(id); n++) id = `${base}_${n}`;
    renamed.set(raw, id);
    taken.add(id);
    return id;
  };

  const addClasses = (id: string, classes: string[]) => {
    const list = nodeClasses.get(id) ?? [];
    list.push(...classes);
    nodeClasses.set(id, list);
  };

  const ensureNode = (parsed: ParsedNode) => {
    if (parsed.classes) addClasses(parsed.id, parsed.classes);
    const existing = nodeMap.get(parsed.id);
    if (!existing) {
      nodeMap.set(parsed.id, { ...parsed, classes: undefined });
      return;
    }
    // enrich: prefer a real shape/label over a bare reference
    if (existing.label === existing.id && (parsed.label !== parsed.id || parsed.icon || parsed.image)) {
      existing.label = parsed.label;
      existing.shape = parsed.shape;
      if (parsed.icon) existing.icon = parsed.icon;
      if (parsed.image) existing.image = parsed.image;
    }
    if (existing.parentId == null && parsed.parentId != null) {
      existing.parentId = parsed.parentId;
    }
  };

  /** Handle one statement; returns the reason it is invalid, or null. */
  const statement = (line: string, idx: number): string | null => {
    // subgraph open: `subgraph id [Title]`, `subgraph "Title"` or `subgraph Title`
    const sg = line.match(/^subgraph\s+(.+)$/i);
    if (sg) {
      const rest = sg[1].trim();
      const idMatch = rest.match(new RegExp(`^(${RAW_ID})\\s*\\[(.+?)\\]$`));
      let id: string;
      let label: string;
      if (idMatch) {
        id = idOf(idMatch[1]);
        label = decodeLabel(stripQuotes(idMatch[2]));
      } else {
        const title = stripQuotes(rest);
        label = decodeLabel(title);
        id = RAW_ID_RE.test(title) ? idOf(title) : title.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        if (!id) id = `subgraph_${++untitled}`;
      }
      const parentId = subgraphStack.length ? subgraphStack[subgraphStack.length - 1] : null;
      // a blank title (`[" "]`) is an untitled group
      ensureNode({ id, label: label.trim() === '' ? '' : label, shape: 'rect', parentId });
      subgraphStack.push(id);
      subgraphIds.add(id);
      return null;
    }

    if (/^end$/i.test(line)) {
      if (subgraphStack.length === 0) return '`end` without a matching `subgraph`';
      subgraphStack.pop();
      return null;
    }

    // per-subgraph layout hint (`direction LR`): valid mermaid, but marmerlade
    // lays groups out itself, so it is accepted and ignored like the header's
    if (/^direction\s+(TB|TD|BT|LR|RL)$/i.test(line)) return null;

    // accessibility title / one-line description: no canvas equivalent
    if (/^acc(Title|Descr)\s*:/.test(line)) return null;

    const classDef = line.match(/^classDef\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s+(.+)$/);
    if (classDef) {
      const style = parseStyleList(classDef[2]);
      for (const name of classDef[1].split(',')) classDefs.set(name.trim(), style);
      return null;
    }
    const cls = line.match(new RegExp(`^class\\s+(${RAW_ID}(?:\\s*,\\s*${RAW_ID})*)\\s+([\\w-]+(?:\\s*,\\s*[\\w-]+)*)$`));
    if (cls) {
      const names = cls[2].split(',').map((s) => s.trim());
      for (const raw of cls[1].split(',')) addClasses(idOf(raw.trim()), names);
      return null;
    }
    const style = line.match(new RegExp(`^style\\s+(${RAW_ID})\\s+(.+)$`));
    if (style) {
      const id = idOf(style[1]);
      nodeStyles.set(id, { ...nodeStyles.get(id), ...parseStyleList(style[2]) });
      return null;
    }
    const linkStyle = line.match(/^linkStyle\s+(default|\d+(?:\s*,\s*\d+)*)\s+(?:interpolate\s+\w+\s*)?(.*)$/);
    if (linkStyle) {
      linkStyles.push({
        line: idx,
        text: line,
        targets: linkStyle[1] === 'default' ? 'default' : linkStyle[1].split(',').map(Number),
        style: parseStyleList(linkStyle[2]),
      });
      return null;
    }

    const parent = subgraphStack.length ? subgraphStack[subgraphStack.length - 1] : null;

    // wiki link: `click A href "#/wiki/<pageId>"`
    const ck = line.match(CLICK_RE);
    if (ck) {
      try {
        pageIds.set(idOf(ck[1]), decodeURIComponent(ck[2]));
      } catch {
        return 'Invalid page URL encoding';
      }
      return null;
    }
    // any other click target (a URL, a callback) has nothing to link to here
    if (OTHER_CLICK_RE.test(line)) return null;

    // metadata on a named edge: `e1@{ animate: true }`
    const meta = line.match(META_RE);
    const named = meta && namedEdges.get(meta[1]);
    if (named) {
      const extra = edgeMetaStyle(meta[2]);
      for (const e of named) e.style = { ...e.style, ...extra };
      return null;
    }

    // edge line; chains and `&` groups expand to one edge per node pair
    const chain = splitChain(line);
    if (chain) {
      const steps = chain.steps.map((tokens) => tokens.map((t) => parseNodeToken(t, parent, idOf)));
      if (!steps.every((s) => s.every((n) => n !== null))) return 'malformed edge endpoint';
      const found = steps as ParsedNode[][];
      found.flat().forEach(ensureNode);
      chain.links.forEach((link, i) => {
        for (const from of found[i])
          for (const to of found[i + 1]) {
            if (link.line === 'invisible') {
              links.push(null);
              continue;
            }
            const edge: DiagramEdge = {
              id: `e${edgeSeq++}`,
              source: from.id,
              target: to.id,
              label: link.label,
              style: { arrowheads: link.arrowheads, ...lineStyle(link.line) },
            };
            edges.push(edge);
            links.push(edge);
            const name = chain.edgeIds[i];
            if (name) namedEdges.set(name, [...(namedEdges.get(name) ?? []), edge]);
          }
      });
      return null;
    }

    // standalone node declaration
    const only = parseNodeToken(line, parent, idOf);
    if (!only) return 'unrecognized statement';
    ensureNode(only);
    return null;
  };

  // YAML frontmatter (`---` … `---`) may open the source, before the header
  const first = rawLines.findIndex((l) => l.trim().length > 0);
  let skipUntil = -1;
  if (first >= 0 && rawLines[first].trim() === '---') {
    const close = rawLines.findIndex((l, i) => i > first && l.trim() === '---');
    if (close < 0) {
      issues.push({ line: first, text: '---', reason: 'unterminated frontmatter (missing closing `---`)' });
      skipUntil = rawLines.length;
    } else {
      skipUntil = close;
    }
  }
  let inAccDescr = false;

  for (let idx = 0; idx < rawLines.length; idx++) {
    if (idx <= skipUntil) continue;
    const line = rawLines[idx].trim();
    if (inAccDescr) {
      if (line.includes('}')) inAccDescr = false;
      continue;
    }
    if (/^%%\s+marmerlade-(pages|decks)\b/.test(line)) {
      const meta = line.match(new RegExp(`^%%\\s+marmerlade-(pages|decks)\\s+(${RAW_ID})\\s+(.+)$`));
      try {
        if (!meta) throw new Error('Expected a node ID and a JSON array of IDs');
        const value: unknown = JSON.parse(meta[3]);
        (meta[1] === 'decks' ? deckLists : pageLists).set(idOf(meta[2]), parsePageIds(value));
      } catch (error) {
        issues.push({ line: idx, text: line, reason: error instanceof Error ? error.message : 'Invalid page links' });
      }
      continue;
    }
    if (line.length === 0 || line.startsWith('%%')) continue;

    // diagram header
    if (/^(flowchart|graph)\b/i.test(line)) continue;
    if (/^sequenceDiagram\b/.test(line)) {
      issues.push({
        line: idx,
        text: line,
        reason: 'expected flowchart or graph in flowchart source',
      });
      break;
    }

    meaningfulLines++;

    // multi-line accessibility description: `accDescr { … }`
    if (/^accDescr\s*\{/.test(line)) {
      inAccDescr = !line.includes('}');
      continue;
    }

    for (const stmt of splitStatements(line)) {
      const reason = statement(stmt, idx);
      if (reason) issues.push({ line: idx, text: line, reason });
    }
  }

  if (subgraphStack.length > 0) {
    issues.push({
      line: rawLines.length - 1,
      text: '',
      reason: `${subgraphStack.length} unterminated subgraph${subgraphStack.length > 1 ? 's' : ''} (missing \`end\`)`,
    });
  }

  // link styles apply by mermaid link index, so they resolve once every link is known
  for (const ls of linkStyles) {
    const targets = ls.targets === 'default' ? links.map((_, i) => i) : ls.targets;
    const missing = targets.find((i) => i >= links.length);
    if (missing !== undefined) {
      issues.push({ line: ls.line, text: ls.text, reason: `linkStyle index ${missing} is out of range (${links.length} links)` });
      continue;
    }
    for (const i of targets) {
      const edge = links[i];
      if (edge) edge.style = { ...edge.style, ...ls.style };
    }
  }

  // `class` may name an edge too (mermaid's animated-edge recipe)
  for (const [name, classes] of nodeClasses) {
    const named = namedEdges.get(name);
    if (!named) continue;
    for (const e of named) for (const c of classes) e.style = { ...e.style, ...classDefs.get(c) };
  }

  // class styles in order, then `style`, which wins; `classDef default` sits under both
  const styleOf = (id: string): ElementStyle | undefined => {
    const style: ElementStyle = {
      ...(subgraphIds.has(id) ? undefined : classDefs.get('default')),
      ...Object.assign({}, ...(nodeClasses.get(id) ?? []).map((c) => classDefs.get(c))),
      ...nodeStyles.get(id),
    };
    return isEmpty(style) ? undefined : style;
  };

  const nodes: DiagramNode[] = [...nodeMap.values()].map((n, i) => {
    const list = pageLists.get(n.id);
    const linked = pageIds.get(n.id);
    const decks = deckLists.get(n.id);
    const style = styleOf(n.id);
    return {
      id: n.id,
      label: n.label,
      shape: n.shape,
      parentId: n.parentId,
      collapsed: false,
      position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 140 },
      ...(n.icon && { icon: n.icon }),
      ...(list !== undefined ? { pageIds: list } : linked ? { pageIds: [linked] } : {}),
      ...(decks !== undefined && { deckIds: decks }),
      ...(n.image && { image: n.image }),
      ...(style && { style }),
    };
  });

  return { diagram: { nodes, edges }, issues, meaningfulLines };
}

export function fromMermaid(src: string): Diagram {
  return parseCore(src).diagram;
}

/** Outcome of a validating parse: either a clean diagram or a readable error. */
export type ParseResult =
  | { ok: true; diagram: Diagram }
  | { ok: false; error: string };

/**
 * Parse `src` strictly: succeeds only when the text is non-blank, every
 * meaningful line matched a known construct, and the result has at least one
 * node. Powers live editor->canvas sync, which must hold the last good canvas
 * while the text is mid-edit or malformed.
 */
export function parseMermaid(src: string): ParseResult {
  if (src.trim().length === 0) {
    return { ok: false, error: 'empty diagram' };
  }
  const { diagram, issues, meaningfulLines } = parseCore(src);
  if (issues.length > 0) {
    const first = issues[0];
    const where = first.text ? `line ${first.line + 1}: "${first.text}"` : `line ${first.line + 1}`;
    return { ok: false, error: `${where} — ${first.reason}` };
  }
  if (diagram.nodes.length === 0) {
    // e.g. only a `flowchart TD` header and blank lines
    return { ok: false, error: meaningfulLines === 0 ? 'no statements' : 'no nodes' };
  }
  return { ok: true, diagram };
}

/**
 * Merge a freshly parsed diagram with the current one, preserving canvas state
 * for elements that still exist. Nodes are matched by id: a surviving node
 * keeps its `position`, `size`, `style`, and `collapsed`, and takes `label`/`shape`/
 * `parentId` from the parsed text. Edges are matched by `source->target` to
 * carry over `style`. Style the text spells out (`style`, `classDef`,
 * `linkStyle`, arrowheads, a dotted or thick line) is laid over the canvas
 * style; see `mergeEdgeStyle` for how the line itself is kept. Elements absent
 * from `parsed` are dropped; genuinely new nodes keep the parsed (grid)
 * position for the caller to lay out.
 */
export function mergeDiagram(parsed: Diagram, current: Diagram): Diagram {
  const curNodes = new Map(current.nodes.map((n) => [n.id, n]));

  const nodes: DiagramNode[] = parsed.nodes.map((p) => {
    const prev = curNodes.get(p.id);
    if (!prev) return p; // new node: keep parsed grid position
    return {
      ...p,
      position: prev.position,
      ...(prev.size && { size: prev.size }),
      collapsed: prev.collapsed,
      ...((p.style ?? prev.style) && { style: p.style ? { ...prev.style, ...p.style } : prev.style }),
      ...((p.pageIds ?? prev.pageIds) !== undefined && { pageIds: p.pageIds ?? prev.pageIds }),
      ...((p.deckIds ?? prev.deckIds) !== undefined && { deckIds: p.deckIds ?? prev.deckIds }),
    };
  });

  // index current edges by endpoint pair (edge ids are not stable across parses)
  const curEdges = new Map<string, DiagramEdge>();
  for (const e of current.edges) curEdges.set(`${e.source}\u0000${e.target}`, e);

  const edges: DiagramEdge[] = parsed.edges.map((p) => {
    const prev = curEdges.get(`${p.source}\u0000${p.target}`);
    if (!prev) return p;
    return {
      ...p,
      style: mergeEdgeStyle(prev.style, p.style),
      ...(prev.order != null && { order: prev.order }),
      ...(prev.sourceSide && { sourceSide: prev.sourceSide }),
      ...(prev.targetSide && { targetSide: prev.targetSide }),
    };
  });

  return { nodes, edges };
}

/**
 * An edge's style after a text sync. The text only says solid, dotted or thick
 * (`-->`, `-.->`, `==>`), so while it still says what the canvas draws, the
 * canvas keeps its exact dash pattern and width (a dashed or 4px edge stays
 * so); when the text changes the kind, the text wins.
 */
function mergeEdgeStyle(prev: ElementStyle = {}, parsed: ElementStyle = {}): ElementStyle {
  const kind = lineKind(parsed);
  const prevDashed = prev.strokeStyle === 'dashed' || prev.strokeStyle === 'dotted';
  const prevWide = (prev.strokeWidth ?? 1) >= THICK_WIDTH;
  const strokeStyle = kind === 'dotted' && prevDashed ? prev.strokeStyle : parsed.strokeStyle;
  const strokeWidth =
    kind === 'thick' ? (prevWide ? prev.strokeWidth : parsed.strokeWidth)
    : kind === 'solid' ? (prevWide ? parsed.strokeWidth : parsed.strokeWidth ?? prev.strokeWidth)
    : parsed.strokeWidth ?? prev.strokeWidth;
  return clean({ ...prev, ...parsed, strokeStyle, strokeWidth });
}

const ARROWS: Record<LineKind, Record<Arrowheads, string>> = {
  solid: { none: '---', start: '<---', end: '-->', both: '<-->' },
  dotted: { none: '-.-', start: '<-.-', end: '-.->', both: '<-.->' },
  thick: { none: '===', start: '<===', end: '==>', both: '<==>' },
};

function shapeWrap(node: DiagramNode): string {
  const l = encodeLabel(node.label);
  if (node.image) {
    // always quoted: a data: URI carries commas, which end a bare value
    const { src, pos, w, h, constraint } = node.image;
    const meta = [`img: "${src.replace(/"/g, '%22')}"`, `label: "${l}"`];
    if (pos) meta.push(`pos: "${pos}"`);
    if (w) meta.push(`w: ${w}`);
    if (h) meta.push(`h: ${h}`);
    if (constraint) meta.push('constraint: "on"');
    return `${node.id}@{ ${meta.join(', ')} }`;
  }
  if (node.icon) {
    return `${node.id}@{ icon: "${node.icon}", form: "${iconForm(node.shape)}", label: "${l}" }`;
  }
  const { open, close } = shapeDef(node.shape);
  // mermaid rejects an empty `""` in bracket shapes, so a blank label is `" "`
  return `${node.id}${open}"${l || ' '}"${close}`;
}

/** A ref back to the diagram element a given source line represents. */
export interface LineRef {
  kind: 'node' | 'edge';
  id: string;
}

export interface MermaidResult {
  text: string;
  /** map of 0-based line index -> the element that line renders */
  lineRefs: Map<number, LineRef>;
}

/**
 * Serialize a diagram to Mermaid, also returning a per-line map back to the
 * node/edge each line came from. Powers the editor<->canvas highlight sync.
 */
export function toMermaidWithMap(diagram: Diagram): MermaidResult {
  const { nodes, edges } = diagram;
  const children = new Map<string | null, DiagramNode[]>();
  for (const n of nodes) {
    const key = n.parentId;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(n);
  }
  const groupIds = new Set(nodes.filter((n) => hasChildren(n.id)).map((n) => n.id));

  function hasChildren(id: string): boolean {
    return nodes.some((n) => n.parentId === id);
  }

  const out: string[] = ['flowchart TD'];
  const lineRefs = new Map<number, LineRef>();
  const indent = (d: number) => '  '.repeat(d + 1);

  function emit(parentId: string | null, depth: number) {
    const kids = children.get(parentId) ?? [];
    for (const n of kids) {
      if (groupIds.has(n.id)) {
        // the subgraph opener line represents the group node
        lineRefs.set(out.length, { kind: 'node', id: n.id });
        // an untitled group still needs a (blank) title to stay valid Mermaid
        out.push(`${indent(depth)}subgraph ${n.id} ["${encodeLabel(n.label) || ' '}"]`);
        emit(n.id, depth + 1);
        out.push(`${indent(depth)}end`);
      } else {
        lineRefs.set(out.length, { kind: 'node', id: n.id });
        out.push(`${indent(depth)}${shapeWrap(n)}`);
      }
    }
  }

  emit(null, 0);

  for (const e of edges) {
    const symbol = ARROWS[lineKind(e.style)][e.style?.arrowheads ?? 'none'];
    const arrow = e.label ? `${symbol}|${encodeLabel(e.label).replace(/\|/g, '#124;')}|` : symbol;
    lineRefs.set(out.length, { kind: 'edge', id: e.id });
    out.push(`  ${e.source} ${arrow} ${e.target}`);
  }

  for (const n of nodes) {
    if (n.deckIds !== undefined) {
      lineRefs.set(out.length, { kind: 'node', id: n.id });
      out.push(`  %% marmerlade-decks ${n.id} ${JSON.stringify(n.deckIds)}`);
    }
    if (n.pageIds === undefined) continue;
    if (n.pageIds[0]) {
      lineRefs.set(out.length, { kind: 'node', id: n.id });
      out.push(`  click ${n.id} href "${pageLink(n.pageIds[0])}"`);
    }
    lineRefs.set(out.length, { kind: 'node', id: n.id });
    out.push(`  %% marmerlade-pages ${n.id} ${JSON.stringify(n.pageIds)}`);
  }

  return { text: out.join('\n'), lineRefs };
}

export function toMermaid(diagram: Diagram): string {
  return toMermaidWithMap(diagram).text;
}
