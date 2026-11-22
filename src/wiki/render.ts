// Markdown -> sanitized HTML, with `[[wikilinks]]` (`[[deck:X]]`, `[[diagram:X]]`
// name the other kinds), the `{{diagram}}` embed (`{{diagram:Target}}` names a
// node or a whole diagram) and Mermaid fences.
// Links are resolved against the live diagram, so renames show up on re-render.

import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Deck, DiagramEntity, DiagramNode, Page } from '../types';
import { resolveLink } from '../pages.ts';
import { deckHref, diagramHref, pageHref } from '../route.ts';
import { readDiagramEmbed } from '../diagramEmbed.ts';
import { refName } from '../references.ts';

export interface RenderContext {
  nodes: DiagramNode[];
  pages: Page[];
  decks?: Deck[];
  diagrams?: DiagramEntity[];
}

let ctx: RenderContext = { nodes: [], pages: [] };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start: (src) => src.indexOf('[['),
      tokenizer(src) {
        const m = /^\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/.exec(src);
        if (!m) return undefined;
        const target = m[1].trim();
        return { type: 'wikilink', raw: m[0], target, text: (m[2] ?? refName(m[1])).trim() };
      },
      renderer(token) {
        const { target, text } = token as unknown as { target: string; text: string };
        const r = resolveLink(target, ctx.nodes, ctx.pages, ctx);
        if (r.kind === 'page')
          return `<a class="wl" data-ref="page:${esc(r.page.id)}" href="${pageHref(r.page.id)}">${esc(text)}</a>`;
        if (r.kind === 'deck')
          return `<a class="wl deck" data-ref="deck:${esc(r.deck.id)}" href="${deckHref(r.deck.id)}">${esc(text)}</a>`;
        if (r.kind === 'diagram')
          return `<a class="wl diagram" data-ref="diagram:${esc(r.entity.id)}" href="${diagramHref(r.entity.id)}">${esc(text)}</a>`;
        if (r.kind === 'node')
          return `<a class="wl" data-ref="node:${esc(r.node.id)}" href="#/wiki" data-node="${esc(r.node.id)}">${esc(text)}</a>`;
        if (/^(deck|diagram):\S/.test(target))
          return `<span class="wl missing" data-ref="missing:${esc(target)}">${esc(text)}</span>`;
        return `<a class="wl new" href="#/wiki" data-create="${esc(target)}">${esc(text)}</a>`;
      },
    },
    {
      name: 'embed',
      level: 'block',
      start: (src) => src.search(/\{\{(?:diagram|sequence)/),
      tokenizer(src) {
        const embed = readDiagramEmbed(src);
        return embed && { type: 'embed', ...embed };
      },
      renderer(token) {
        const embed = readDiagramEmbed(token.raw);
        if (!embed) return '';
        const width = embed.width === null ? '' : ` data-embed-width="${embed.width}" style="width:${embed.width}%"`;
        if (embed.sequence) return `<div class="embed" data-sequence="${esc(embed.target)}"${width}></div>\n`;
        return `<div class="embed" data-embed="${esc(embed.target)}"${width}></div>\n`;
      },
    },
  ],
  renderer: {
    // a Mermaid fence is a picture, drawn by Preview; URI-encoded because the
    // sanitizer drops any attribute holding an arrow (`-->` closes a comment)
    code: ({ text, lang }) =>
      lang === 'mermaid' ? `<div class="embed" data-mermaid="${encodeURIComponent(text)}"></div>\n` : false,
  },
});

/** Sanitized HTML for a page body. Raw HTML in the Markdown is cleaned, not trusted. */
export function renderPage(body: string, context: RenderContext): string {
  ctx = context;
  const html = marked.parse(body, { async: false, gfm: true });
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-node', 'data-create', 'data-embed', 'data-mermaid', 'data-sequence', 'data-ref'] });
}
