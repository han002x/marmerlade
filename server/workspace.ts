import { readFile, writeFile, rename, mkdir, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import type { Diagram } from '../src/types.ts';
import { parseDiagram, type Change } from '../src/workspaceSchema.ts';
import { briefSchema, type Brief, type BriefInput, type BriefReview } from '../src/briefSchema.ts';
import { prepareBrief } from './brief.ts';

export class Conflict extends Error {}
export async function openWorkspace(filename: string) {
  await mkdir(dirname(resolve(filename)), { recursive: true });
  const file = await realpath(filename).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return resolve(await realpath(dirname(resolve(filename))), basename(filename));
  });
  const release = await lockfile.lock(file, { realpath: false });
  let diagram: Diagram;
  let revision = 0;
  let brief: Brief | null = null;
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    const saved = typeof raw === 'object' && raw !== null && 'diagram' in raw ? raw : null;
    if (saved && 'version' in saved && ![1, 2, 3].includes(Number(saved.version))) throw new Error('Unsupported file version');
    diagram = parseDiagram(saved ? saved.diagram : raw);
    if (saved && 'revision' in saved) {
      if (!Number.isSafeInteger(saved.revision) || Number(saved.revision) < 0) throw new Error('Invalid saved revision');
      revision = Number(saved.revision);
    }
    if (saved && 'brief' in saved && saved.brief !== null) brief = briefSchema.parse(saved.brief);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) { await release(); throw error; }
    diagram = { nodes: [], edges: [], pages: [], decks: [] };
  }
  let queue = Promise.resolve();
  const listeners = new Set<() => void>();
  const snapshot = () => ({ revision, diagram: structuredClone(diagram) });
  const briefStatus = () => ({ brief: structuredClone(brief), revision, nodeCount: diagram.nodes.length });
  function enqueue<T>(operation: () => Promise<T>) {
    const result = queue.then(operation);
    queue = result.then(() => {}, () => {});
    return result;
  }
  async function persist(next: Diagram, nextRevision: number, nextBrief: Brief | null) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify({ version: 3, revision: nextRevision, diagram: next, brief: nextBrief }, null, 2), { flag: 'wx' });
      await rename(temp, file);
    } finally { await unlink(temp).catch(() => {}); }
    diagram = next; revision = nextRevision; brief = nextBrief;
    listeners.forEach(listener => listener());
  }
  function expectRevision(expected: number) {
    if (expected !== revision) throw new Conflict('Workspace changed. Read the latest revision before retrying.');
  }
  function commit(expectedRevision: number, transform: (d: Diagram) => Diagram) {
    return enqueue(async () => {
      expectRevision(expectedRevision);
      await persist(parseDiagram(transform(structuredClone(diagram))), revision + 1, brief);
      return snapshot();
    });
  }
  return {
    file, snapshot, commit, briefStatus,
    stageBrief(expectedRevision: number, input: BriefInput, repository: string) {
      return enqueue(async () => {
        expectRevision(expectedRevision);
        const draft = await prepareBrief(input, repository, revision, structuredClone(diagram));
        await persist(diagram, revision, draft);
        return briefStatus();
      });
    },
    reviewBrief(review: BriefReview) {
      return enqueue(async () => {
        if (!brief || review.id !== brief.id) throw new Conflict('The brief changed. Reload and review the latest version.');
        if (brief.kind === 'generated' && review.action === 'approve') return briefStatus();
        if (brief.kind !== 'draft') throw new Conflict('Ask your assistant for a revised brief.');
        if (review.action === 'request_changes') {
          await persist(diagram, revision, { ...brief, kind: 'changes_requested', feedback: review.feedback });
        } else {
          expectRevision(brief.basedOn);
          await persist(parseDiagram(brief.diagram), revision + 1, { ...brief, kind: 'generated', approvedAt: new Date().toISOString(), generatedRevision: revision + 1 });
        }
        return briefStatus();
      });
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async close() { await queue; await release(); },
  };
}
export type Workspace = Awaited<ReturnType<typeof openWorkspace>>;

export function applyChanges(d: Diagram, changes: Change[]): Diagram {
  const put = <T extends { id: string }>(list: T[], value: T) => [...list.filter(x => x.id !== value.id), value];
  for (const change of changes) {
    switch (change.kind) {
      case 'put_node': d.nodes = put(d.nodes, change.node); break;
      case 'put_edge': d.edges = put(d.edges, change.edge); break;
      case 'put_page': d.pages = put(d.pages ?? [], { ...change.document, updatedAt: Date.now() }); break;
      case 'put_deck': d.decks = put(d.decks ?? [], { ...change.document, updatedAt: Date.now() }); break;
      case 'delete_edge': d.edges = d.edges.filter(e => e.id !== change.id); break;
      case 'delete_node': {
        const removed = new Set([change.id]);
        let count;
        do { count = removed.size; d.nodes.forEach(n => { if (n.parentId && removed.has(n.parentId)) removed.add(n.id); }); } while (removed.size !== count);
        d.nodes = d.nodes.filter(n => !removed.has(n.id));
        d.edges = d.edges.filter(e => !removed.has(e.source) && !removed.has(e.target));
        break;
      }
      case 'delete_page':
        d.pages = (d.pages ?? []).filter(p => p.id !== change.id);
        d.nodes = d.nodes.map(n => ({ ...n, pageIds: n.pageIds?.filter(id => id !== change.id) })); break;
      case 'delete_deck':
        d.decks = (d.decks ?? []).filter(p => p.id !== change.id);
        d.nodes = d.nodes.map(n => ({ ...n, deckIds: n.deckIds?.filter(id => id !== change.id) })); break;
    }
  }
  return d;
}
