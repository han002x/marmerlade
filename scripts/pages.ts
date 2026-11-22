// Wiki page logic: lazy creation, sharing, orphans, cross-window merge.
// Run with: node --experimental-strip-types scripts/pages.ts
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
// DOMPurify binds to a window at import time
(globalThis as { window?: unknown }).window = new JSDOM('').window;
const { renderPage } = await import('../src/wiki/render.ts');
const { parseRoute, pageHref } = await import('../src/route.ts');
const { useDiagram } = await import('../src/store.ts');
const { showPage, useDock } = await import('../src/dock.ts');
const { readSaved, write, importFile, startSync, startAutosave } = await import('../src/persist.ts');
import {
  backlinks,
  createPageFor,
  embedDiagram,
  extractLinks,
  foldedAncestors,
  linkableNodes,
  mergePages,
  orphanPages,
  pageOf,
  pathTo,
  resolveLink,
  resolveEmbed,
  entityDiagram,
  normalizeDiagram,
  nodesOfPage,
} from '../src/pages.ts';
import { filterReferences, parseRef, refName, references, refTarget, retarget } from '../src/references.ts';
import { mergeDiagram } from '../src/mermaid/io.ts';
import type { Diagram, DiagramEntity, DiagramNode, Page } from '../src/types.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}`, detail ?? '');
  }
};

const node = (id: string, label: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id,
  label,
  shape: 'rect',
  parentId: null,
  collapsed: false,
  position: { x: 0, y: 0 },
  ...extra,
});
const page = (id: string, title: string, updatedAt: number): Page => ({
  id,
  title,
  body: '',
  updatedAt,
});

// ---- lazy creation ----
{
  const a = node('a', 'API');
  const p = createPageFor(a, [], 1);
  check('creates a page titled from the label', p?.title === 'API' && p.body === '' && p.updatedAt === 1, p);
  const linked = node('a', 'API', { pageIds: [p!.id] });
  check('no second page once linked', createPageFor(linked, [p!]) === null);
  const dangling = node('b', 'DB', { pageIds: ['gone'] });
  check('dangling pageId is reused', createPageFor(dangling, [])?.id === 'gone');
  check('pageOf finds the page', pageOf(linked, [p!]) === p);
}

// ---- orphans: deleting a node keeps its page ----
{
  const pages = [page('p1', 'A', 1), page('p2', 'B', 1)];
  const orphans = orphanPages([node('a', 'A', { pageIds: ['p1'] })], pages);
  check('unreferenced page is an orphan', orphans.length === 1 && orphans[0].id === 'p2', orphans);
}

// ---- mergePages: the save is the truth, newer wins, fresh local pages survive ----
{
  const now = 100_000;
  const local = [page('p1', 'mine', 5), page('p2', 'only-local', 1), page('p4', 'unsaved', now - 100)];
  const remote = [page('p1', 'theirs', 9), page('p3', 'only-remote', 1)];
  const m = mergePages(local, remote, now);
  const by = Object.fromEntries(m.map((p) => [p.id, p.title]));
  check('newer remote wins', by.p1 === 'theirs', by);
  check('page only we have was deleted there', !('p2' in by), by);
  check('just-edited local page is kept', by.p4 === 'unsaved', by);
  check('adds remote-only page', by.p3 === 'only-remote', by);
  check('older remote loses', mergePages(local, [page('p1', 'stale', 2), ...local.slice(1)], now)[0].title === 'mine');
  const settled = [page('p1', 'mine', 5)];
  check('no change returns the same array', mergePages(settled, settled, now) === settled);
}

// ---- linkableNodes ----
{
  const ids = linkableNodes([node('a', 'A', { pageIds: ['p'] }), node('b', 'B', { pageIds: ['other'] })], 'p').map((n) => n.id);
  check('nodes can link additional pages', ids.join() === 'b', ids);
}

// ---- Mermaid live sync keeps the link ----
{
  const current: Diagram = { nodes: [node('a', 'A', { pageIds: ['p1'] })], edges: [] };
  const parsed: Diagram = { nodes: [node('a', 'A renamed')], edges: [] };
  const merged = mergeDiagram(parsed, current);
  check('merge keeps pageId', merged.nodes[0].pageIds?.[0] === 'p1', merged.nodes[0]);
}

// ---- wikilinks, backlinks ----
{
  const nodes = [node('a', 'API', { pageIds: ['p1'] }), node('b', 'Cache')];
  const pages = [
    { ...page('p1', 'API', 1), body: 'see [[Cache]] and [[ghost|Boo]]' },
    { ...page('p2', 'Notes', 1), body: 'back to [[api]]' },
  ];
  check('extractLinks reads targets, not aliases', extractLinks(pages[0].body).join() === 'Cache,ghost');
  check('link finds page by title, any case', resolveLink('api', nodes, pages).kind === 'page');
  const viaNode = resolveLink('Cache', nodes, pages);
  check('link finds a node with no page yet', viaNode.kind === 'node' && viaNode.node.id === 'b', viaNode);
  check('unknown link is none', resolveLink('ghost', nodes, pages).kind === 'none');
  const back = backlinks(pages[0], nodes, pages);
  check('backlinks list linking pages', back.length === 1 && back[0].id === 'p2', back);
  check('a page does not back-link itself', !backlinks(pages[1], nodes, pages).some((p) => p.id === 'p2'));

  const html = renderPage(
    'a [[API]] b [[Cache|the cache]] c [[ghost]]\n\n{{diagram}}\n\n<script>alert(1)</script><img src=x onerror=alert(1)>',
    { nodes, pages },
  );
  check('page link renders as hash link', html.includes('href="#/wiki/p1"'), html);
  check('node link carries the node id', html.includes('data-node="b"') && html.includes('the cache'), html);
  check('unresolved link is marked new', html.includes('class="wl new"') && html.includes('data-create="ghost"'), html);
  check('embed placeholder survives', html.includes('data-embed'), html);
  check('scripts and handlers are stripped', !/<script|onerror/.test(html), html);
}

// ---- references between pages, decks and diagrams ----
{
  check('unprefixed targets are pages', parseRef(' API ').kind === 'page' && parseRef('API').name === 'API');
  check('deck: and diagram: name their kind', parseRef('deck:Q3 Review').kind === 'deck' && parseRef('diagram:Checkout').name === 'Checkout');
  check('a prefix needs a name', parseRef('deck: ').kind === 'page' && parseRef('Diagram: Overview').kind === 'page');
  check('refTarget inverts parseRef', refTarget('deck', 'Q3') === 'deck:Q3' && refTarget('page', 'API') === 'API' && refName('diagram:Flow') === 'Flow');

  const nodes = [node('a', 'API', { pageIds: ['p1'] }), node('b', 'Cache')];
  const pages = [page('p1', 'API', 1)];
  const decks = [page('d1', 'Q3 Review', 1)];
  const flow: DiagramEntity = { id: 'e1', title: 'Checkout', kind: 'flowchart', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
    nodes: [node('x', 'Cart', { pageIds: ['p1'] }), node('y', 'Pay')], edges: [{ id: 'xy', source: 'x', target: 'y' }] };
  const seq: DiagramEntity = { id: 'e2', title: 'Login', kind: 'sequence', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, source: 'sequenceDiagram\nA->>B: hi' };
  const more = { decks, diagrams: [flow, seq] };

  const deck = resolveLink('deck:q3 review', nodes, pages, more);
  check('deck link resolves, any case', deck.kind === 'deck' && deck.deck.id === 'd1', deck);
  const diagram = resolveLink('diagram:Checkout', nodes, pages, more);
  check('diagram link resolves to the entity', diagram.kind === 'diagram' && diagram.entity.id === 'e1', diagram);
  check('missing deck is none, not a node', resolveLink('deck:Cache', nodes, pages, more).kind === 'none');
  check('unprefixed links never reach decks', resolveLink('Q3 Review', nodes, pages, more).kind === 'none');
  check('old callers without decks still work', resolveLink('deck:Q3 Review', nodes, pages).kind === 'none' && resolveLink('API', nodes, pages).kind === 'page');
  check('backlinks ignore deck links', backlinks(pages[0], nodes, [...pages, { ...page('p2', 'X', 1), body: '[[deck:API]]' }]).length === 0);

  const html = renderPage('[[deck:Q3 Review|the deck]] [[diagram:Checkout]] [[deck:Nope]] [[API]]\n\n{{diagram:Checkout}}\n\n{{sequence:Login}}', { nodes, pages, ...more });
  check('deck link renders to the slides route', html.includes('class="wl deck" data-ref="deck:d1" href="#/slides/d1"') && html.includes('>the deck<'), html);
  check('diagram link renders to the board route, without its prefix', html.includes('data-ref="diagram:e1" href="#/diagrams/e1">Checkout<'), html);
  check('missing deck renders as missing', html.includes('class="wl missing" data-ref="missing:deck:Nope"'), html);
  check('page links carry a preview key', html.includes('data-ref="page:p1"'), html);
  check('named embeds keep their target', html.includes('data-embed="Checkout"') && html.includes('data-sequence="Login"'), html);
  check('diagram route parses', JSON.stringify(parseRoute('#/diagrams/e1')) === '{"kind":"diagram","id":"e1"}' && parseRoute('#/diagrams').kind === 'canvas');

  const node1 = resolveEmbed('Cache', nodes, more.diagrams, 'a');
  check('embed: a node of the open flowchart wins', node1?.kind === 'node' && node1.id === 'b', node1);
  const whole = resolveEmbed('checkout', nodes, more.diagrams, 'a');
  check('embed: else a whole diagram by title', whole?.kind === 'entity' && whole.entity.id === 'e1', whole);
  check('embed: bare target still takes the fallback node', resolveEmbed('', nodes, more.diagrams, 'a')?.kind === 'node');
  check('embed: sequence names only sequences', resolveEmbed('Checkout', nodes, more.diagrams, undefined, true) === undefined
    && resolveEmbed('Login', nodes, more.diagrams, undefined, true)?.kind === 'entity');
  check('a whole embedded flowchart drops page links', entityDiagram(flow as Extract<DiagramEntity, { kind: 'flowchart' }>).nodes.every((n) => !n.pageIds));

  const refs = references({ nodes, pages, decks, diagrams: more.diagrams });
  check('references list every kind once', refs.map((r) => r.target).join() === 'API,deck:Q3 Review,diagram:Checkout,diagram:Login,Cache', refs);
  check('filter narrows by kind prefix', filterReferences(refs, 'diagram:log').map((r) => r.title).join() === 'Login');
  const ranked = filterReferences(references({ nodes: [node('c', 'Cat')], pages: [page('p', 'Big Cat', 1)] }), 'cat');
  check('filter ranks prefix matches before kind order', ranked.map((r) => r.title).join() === 'Cat,Big Cat', ranked);

  const body = 'a [[deck:Q3 Review|deck]] b [[Q3 Review]] c [[diagram:Checkout]]\n{{diagram:Checkout}}{width=50%}\n{{sequence:Checkout}}\n<span data-slide-diagram="Checkout"></span>';
  check('retarget follows a deck rename only', retarget(body, 'deck', 'q3 review', 'Q4') === body.replace('deck:Q3 Review|', 'deck:Q4|'), retarget(body, 'deck', 'q3 review', 'Q4'));
  const moved = retarget(body, 'diagram', 'Checkout', 'Buy');
  check('retarget follows a diagram rename into links and embeds', !moved.includes('Checkout') && moved.includes('{{diagram:Buy}}{width=50%}') && moved.includes('data-slide-diagram="Buy"'), moved);
  check('retarget leaves other text alone', retarget(body, 'page', 'Nope', 'X') === body);
}

// ---- retitle through the store ----
{
  const flow: DiagramEntity = { id: 'e1', title: 'Checkout', kind: 'flowchart', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, nodes: [], edges: [] };
  useDiagram.setState({
    nodes: [], edges: [], diagrams: [flow, { ...flow, id: 'e2', title: 'Other' }], activeDiagramId: null,
    pages: [{ ...page('p1', 'API', 1), body: '[[diagram:Checkout]] [[deck:Plan]]' }],
    decks: [{ ...page('d1', 'Plan', 1), body: '{{diagram:Checkout}}' }],
  });
  useDiagram.setState({ diagrams: [{ ...flow, title: 'Buy' }, { ...flow, id: 'e2', title: 'Other' }] });
  useDiagram.getState().retitle('diagram', 'e1', 'Checkout');
  const st = useDiagram.getState();
  check('renaming a diagram rewrites page and deck references', st.pages[0].body === '[[diagram:Buy]] [[deck:Plan]]' && st.decks[0].body === '{{diagram:Buy}}', [st.pages[0].body, st.decks[0].body]);
  useDiagram.getState().updateDeck('d1', { title: 'Other plan' });
  useDiagram.getState().retitle('deck', 'd1', 'Plan');
  check('renaming a deck rewrites links to it', useDiagram.getState().pages[0].body === '[[diagram:Buy]] [[deck:Other plan]]', useDiagram.getState().pages[0].body);
  useDiagram.setState({ diagrams: [{ ...flow, title: 'Other' }, { ...flow, id: 'e2', title: 'Other' }] });
  const before = useDiagram.getState().pages[0].body;
  useDiagram.getState().retitle('diagram', 'e1', 'Buy');
  check('a clashing title rewrites nothing', useDiagram.getState().pages[0].body === before);
}

// ---- structure: path, folded ancestors, embeds ----
{
  const nodes = [
    node('g', 'Group', { collapsed: true }),
    node('h', 'Inner', { parentId: 'g', collapsed: true }),
    node('x', 'Deep', { parentId: 'h', pageIds: ['p9'] }),
    node('y', 'Sibling', { parentId: 'h' }),
    node('z', 'Outside'),
  ];
  const edges = [
    { id: 'e1', source: 'x', target: 'y' },
    { id: 'e2', source: 'x', target: 'z' },
    { id: 'e3', source: 'z', target: 'g' },
  ];
  check('pathTo runs root to node', pathTo(nodes, 'x').map((n) => n.id).join() === 'g,h,x');
  check('foldedAncestors lists what hides it', foldedAncestors(nodes, 'x').join() === 'g,h');
  const group = embedDiagram({ nodes, edges }, 'h');
  check('group embed is its subtree', group.nodes.map((n) => n.id).join() === 'x,y' && group.edges.length === 1, group);
  check('group embed re-roots children', group.nodes.every((n) => n.parentId === null));
  const leaf = embedDiagram({ nodes, edges }, 'x');
  check('leaf embed adds neighbours', leaf.nodes.map((n) => n.id).sort().join() === 'x,y,z', leaf);
  check('embed drops page links', leaf.nodes.every((n) => n.pageIds === undefined));
}

// ---- routes ----
{
  check('empty hash is the canvas', parseRoute('').kind === 'canvas');
  const r = parseRoute('#/wiki/page1');
  check('wiki page route', r.kind === 'wiki' && r.id === 'page1', r);
  check('wiki index route', JSON.stringify(parseRoute('#/wiki')) === '{"kind":"wiki","id":null}');
  const n = parseRoute('#/node/a%20b');
  check('node route decodes', n.kind === 'node' && n.id === 'a b', n);
  check('bare #/node is the canvas', parseRoute('#/node').kind === 'canvas');
  assert.deepEqual(parseRoute(pageHref('page 1', 'node 2')), { kind: 'wiki', id: 'page 1', nodeId: 'node 2' });
}

// Exercise the real store actions, including links changed by Mermaid and undo.
{
  const st = useDiagram.getState();
  st.load({ nodes: [node('a', 'API'), node('b', 'DB')], edges: [] });
  const first = st.openPage('a');
  assert.ok(first);
  const second = st.createPageForNode('a');
  assert.ok(second);
  assert.notEqual(first, second);
  const ids = (id: string) => useDiagram.getState().nodes.find((n) => n.id === id)?.pageIds;
  assert.deepEqual(ids('a'), [first, second]);
  assert.equal(st.openPage('a'), first);
  st.linkPage(second, 'a');
  st.linkPage(second, 'b');
  st.linkPage('missing', 'a');
  assert.deepEqual(ids('a'), [first, second]);
  assert.deepEqual(nodesOfPage(useDiagram.getState().nodes, second).map((n) => n.id), ['a', 'b']);
  st.updatePage(second, { title: 'Shared notes', body: 'Persist this body' });
  st.updateLabel('a', 'Renamed');
  assert.equal(useDiagram.getState().pages.find((p) => p.id === first)?.title, 'API');
  assert.equal(useDiagram.getState().pages.find((p) => p.id === second)?.title, 'Shared notes');
  st.makeDefaultPage(second, 'a');
  assert.deepEqual(ids('a'), [second, first]);
  st.makeDefaultPage('missing', 'a');
  assert.equal(st.openPage('a'), second);
  assert.equal(st.openPage('a', 'missing'), null);
  showPage('a', first);
  assert.equal(useDock.getState().page?.id, first);
  showPage('a');
  assert.equal(useDock.getState().page?.id, second);
  st.setSelection(['b'], []);
  assert.equal(useDock.getState().page, null);
  st.unlinkPage(second, 'a');
  assert.deepEqual(ids('a'), [first]);
  assert.deepEqual(ids('b'), [second]);
  assert.equal(orphanPages(useDiagram.getState().nodes, useDiagram.getState().pages).length, 0);
  st.removeNode('b');
  assert.deepEqual(orphanPages(useDiagram.getState().nodes, useDiagram.getState().pages).map((p) => p.id), [second]);
  st.undo();
  assert.deepEqual(ids('b'), [second]);
  st.deletePage(second);
  assert.deepEqual(ids('b'), []);
  assert.ok(!useDiagram.getState().pages.some((p) => p.id === second));
  st.undo();
  assert.ok(useDiagram.getState().nodes.every((n) => !n.pageIds?.includes(second)));

  st.load({ nodes: [node('a', 'API', { pageIds: ['missing', 'later'] })], edges: [] });
  assert.equal(st.openPage('a', 'later'), 'later');
  assert.equal(st.openPage('a'), 'missing');
  assert.deepEqual(ids('a'), ['missing', 'later']);
  assert.ok(st.syncMermaid('flowchart TD\na[API]\n%% marmerlade-pages a ["later","missing"]').ok);
  assert.deepEqual(ids('a'), ['later', 'missing']);
  assert.ok(st.syncMermaid('flowchart TD\na[API]\n%% marmerlade-pages a []').ok);
  assert.deepEqual(ids('a'), []);
  assert.equal(useDiagram.getState().pages.length, 2);
}

// Old saves migrate at every entry point, and new saves retain order and sharing.
{
  const storageWindow = new JSDOM('', { url: 'https://marmerlade.test' }).window;
  Object.defineProperty(globalThis, 'localStorage', { value: storageWindow.localStorage, configurable: true });
  const legacy = { nodes: [{ ...node('a', 'API'), pageId: 'p1' }], edges: [], pages: [page('p1', 'Notes', 1)] };
  const migrated = normalizeDiagram(legacy);
  assert.deepEqual(migrated.nodes[0].pageIds, ['p1']);
  assert.equal('pageId' in migrated.nodes[0], false);
  assert.deepEqual(normalizeDiagram({ nodes: [node('a', 'API')], edges: [] }).pages, []);
  assert.deepEqual(normalizeDiagram({ ...legacy, nodes: [{ ...legacy.nodes[0], pageIds: [] }] }).nodes[0].pageIds, []);
  localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 1, diagram: legacy }));
  assert.deepEqual(readSaved()?.nodes[0].pageIds, ['p1']);
  useDiagram.getState().load(legacy);
  assert.deepEqual(useDiagram.getState().nodes[0].pageIds, ['p1']);
  useDiagram.getState().applyRemote(legacy);
  assert.deepEqual(useDiagram.getState().nodes[0].pageIds, ['p1']);
  await importFile(new File([JSON.stringify({ version: 1, diagram: legacy })], 'legacy.marmerlade.json'));
  assert.deepEqual(useDiagram.getState().nodes[0].pageIds, ['p1']);
  const multiple: Diagram = { nodes: [node('a', 'API', { pageIds: ['p2', 'p1'] }), node('b', 'DB', { pageIds: ['p2'] })],
    edges: [], pages: [page('p1', 'First', 1), page('p2', 'Shared', 2)] };
  write(multiple);
  assert.equal(JSON.parse(localStorage.getItem('marmerlade.diagram')!).version, 3);
  assert.deepEqual(readSaved(), { ...multiple, decks: [] });
  await importFile(new File([JSON.stringify({ version: 2, diagram: multiple })], 'new.marmerlade.json'));
  assert.deepEqual(useDiagram.getState().nodes.map((n) => n.pageIds), [['p2', 'p1'], ['p2']]);
  write({ ...multiple, nodes: [node('a', 'API', { pageIds: ['p1', 'p2'] }), node('b', 'DB', { pageIds: [] })] });
  // Dispatch the same storage event the other window receives.
  const stop = startSync();
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'marmerlade.diagram' }));
  assert.deepEqual(useDiagram.getState().nodes.map((n) => n.pageIds), [['p1', 'p2'], []]);
  stop();
  const stopAutosave = startAutosave(0);
  useDiagram.getState().makeDefaultPage('p2', 'a');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(readSaved()?.nodes[0].pageIds, ['p2', 'p1']);
  stopAutosave();
  storageWindow.close();
}

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('PASS: wiki pages create, share, orphan, merge, and survive live sync');
