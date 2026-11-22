// References between pages, decks and diagrams.
// `[[Title]]` names a page (or a node label), `[[deck:Title]]` a deck and
// `[[diagram:Title]]` a diagram on the canvas. Pure: no store or DOM.

import type { Deck, DiagramEntity, DiagramNode, Page } from './types';

export type RefKind = 'page' | 'deck' | 'diagram';
export const REF_KINDS: RefKind[] = ['page', 'deck', 'diagram'];

/** One thing a link can name, as the `[[` picker lists it. */
export type Reference = {
  kind: RefKind | 'node';
  id: string;
  title: string;
  target: string;
  /** what the picker draws beside it */
  icon: 'page' | 'deck' | 'flowchart' | 'sequence' | 'circle';
};

export interface RefSources {
  nodes: DiagramNode[];
  pages: Page[];
  decks?: Deck[];
  diagrams?: DiagramEntity[];
}

const PREFIX = /^(deck|diagram):(?=\S)/;

/** The kind and name a link target spells. Unprefixed targets are pages. */
export function parseRef(target: string): { kind: RefKind; name: string } {
  const text = target.trim();
  const m = PREFIX.exec(text);
  return m ? { kind: m[1] as RefKind, name: text.slice(m[0].length).trim() } : { kind: 'page', name: text };
}

/** The link target naming `title` of `kind`. */
export const refTarget = (kind: RefKind | 'node', title: string) =>
  kind === 'page' || kind === 'node' ? title : `${kind}:${title}`;

/** What a link shows when it has no alias. */
export const refName = (target: string) => parseRef(target).name;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Everything a link can name: pages, decks, diagrams, then node labels without a page of that name. */
export function references({ nodes, pages, decks = [], diagrams = [] }: RefSources): Reference[] {
  const out: Reference[] = [];
  const seen = new Set<string>();
  const add = (kind: Reference['kind'], id: string, title: string, icon: Reference['icon']) => {
    const target = refTarget(kind, title.trim());
    const key = target.toLowerCase();
    if (!title.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ kind, id, title: title.trim(), target, icon });
  };
  for (const p of pages) add('page', p.id, p.title, 'page');
  for (const d of decks) add('deck', d.id, d.title, 'deck');
  for (const e of diagrams) add('diagram', e.id, e.title, e.kind);
  for (const n of nodes) add('node', n.id, n.label, 'circle');
  return out;
}

/** The RefCard key for a reference. */
export const referenceKey = (r: Pick<Reference, 'kind' | 'id'>) => `${r.kind}:${r.id}`;

const ORDER: Record<Reference['kind'], number> = { page: 0, deck: 1, diagram: 2, node: 3 };

/** References matching what follows `[[`: `deck:` / `diagram:` narrows the kind. */
export function filterReferences(refs: Reference[], query: string): Reference[] {
  const m = /^(page|deck|diagram):/i.exec(query);
  const kind = m?.[1].toLowerCase() as RefKind | undefined;
  const text = (m ? query.slice(m[0].length) : query).trim().toLowerCase();
  return refs
    .filter((r) => (!kind || r.kind === kind || (kind === 'page' && r.kind === 'node')) && r.title.toLowerCase().includes(text))
    .sort((a, b) =>
      Number(b.title.toLowerCase().startsWith(text)) - Number(a.title.toLowerCase().startsWith(text))
      || ORDER[a.kind] - ORDER[b.kind]
      || a.title.localeCompare(b.title));
}

const LINK = /\[\[([^[\]|]+)(\|[^[\]]+)?\]\]/g;
const NAMED_EMBED = /^\{\{(diagram|sequence):([^}\n]+)\}\}/gm;
const SLIDE_DIAGRAM = /data-slide-diagram="([^"]*)"/g;

const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

/**
 * Point links (and, for diagrams, named embeds) at `to` after a rename from
 * `from`. Returns the body unchanged when nothing named the old title.
 */
export function retarget(body: string, kind: RefKind, from: string, to: string): string {
  if (!from.trim() || !to.trim() || from.trim() === to.trim()) return body;
  let next = body.replace(LINK, (all, target: string, alias = '') => {
    const ref = parseRef(target);
    return ref.kind === kind && same(ref.name, from) ? `[[${refTarget(kind, to.trim())}${alias}]]` : all;
  });
  if (kind === 'diagram') {
    next = next
      .replace(NAMED_EMBED, (all, form: string, target: string) => (same(target, from) ? `{{${form}:${to.trim()}}}` : all))
      .replace(SLIDE_DIAGRAM, (all, target: string) =>
        same(decode(target), from) ? `data-slide-diagram="${encodeURIComponent(to.trim())}"` : all);
  }
  return next;
}
