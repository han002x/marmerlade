import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkspace } from '../server/workspace.ts';
import { readRepositoryFile } from '../server/repository.ts';
import type { BriefInput } from '../src/briefSchema.ts';

const input: BriefInput = {
  title: 'Request workflow', audience: 'Developers', goal: 'Trace a request', workflow: 'Receive, store, reply',
  source: 'flowchart LR\n A[Receive request] --> B[Store result]',
  evidence: [{ path: 'README.md', line: 1, note: 'Describes the request workflow' }], assumptions: ['Runtime behavior has not been tested'], outputs: ['mermaid', 'svg', 'png'],
};
test('brief review, exact revision, feedback, atomic generation, retry and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marmerlade-brief-'));
  const file = join(dir, 'diagram.json');
  await writeFile(join(dir, 'README.md'), '# Request workflow\nReceive, store, reply.\n');
  let workspace = await openWorkspace(file);
  try {
    const draft = await workspace.stageBrief(0, input, dir);
    assert.equal(draft.brief?.kind, 'draft');
    assert.deepEqual(workspace.snapshot().diagram.nodes, []);
    assert.ok(draft.brief);
    const oldId = draft.brief.id;
    await workspace.reviewBrief({ action: 'request_changes', id: oldId, feedback: 'Add the reply' });
    const feedback = workspace.briefStatus().brief;
    assert.equal(feedback?.kind, 'changes_requested');
    assert.ok(feedback?.kind === 'changes_requested' && feedback.feedback === 'Add the reply');
    await assert.rejects(workspace.reviewBrief({ action: 'approve', id: oldId }), /revised brief/);
    const revised = await workspace.stageBrief(0, { ...input, source: input.source + '\n B --> C[Reply]' }, dir);
    assert.ok(revised.brief);
    assert.notEqual(revised.brief.id, oldId);
    await assert.rejects(workspace.reviewBrief({ action: 'approve', id: oldId }), /brief changed/);
    await workspace.close();
    workspace = await openWorkspace(file);
    assert.equal(workspace.briefStatus().brief?.id, revised.brief.id);
    const generated = await workspace.reviewBrief({ action: 'approve', id: revised.brief.id });
    assert.equal(generated.brief?.kind, 'generated');
    assert.equal(generated.revision, 1);
    assert.deepEqual(workspace.snapshot().diagram.nodes.map(node => node.label), ['Receive request', 'Store result', 'Reply']);
    assert.deepEqual(workspace.snapshot().diagram.edges.map(edge => edge.order), [1, 2]);
    await workspace.commit(1, diagram => ({ ...diagram, nodes: diagram.nodes.map(node => ({ ...node, label: 'Manual edit' })) }));
    await workspace.reviewBrief({ action: 'approve', id: revised.brief.id });
    assert.equal(workspace.snapshot().revision, 2);
    assert.equal(workspace.snapshot().diagram.nodes[0].label, 'Manual edit');
    await workspace.close();
    workspace = await openWorkspace(file);
    assert.equal(workspace.snapshot().revision, 2);
    assert.equal(workspace.snapshot().diagram.nodes[0].label, 'Manual edit');
    assert.equal(workspace.briefStatus().brief?.kind, 'generated');
    const pending = await workspace.stageBrief(2, input, dir);
    assert.ok(pending.brief);
    await workspace.commit(2, diagram => diagram);
    await assert.rejects(workspace.reviewBrief({ action: 'approve', id: pending.brief.id }), /Workspace changed/);
    await assert.rejects(workspace.stageBrief(3, { ...input, evidence: [{ path: 'README.md', line: 100, note: 'Invalid' }] }, dir), /Evidence line/);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.revision, 3);
    assert.equal(saved.brief.id, pending.brief.id);
  } finally { await workspace.close(); await rm(dir, { recursive: true, force: true }); }
});
test('repository evidence cannot follow symlinks outside the root or into secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marmerlade-evidence-'));
  const outside = await mkdtemp(join(tmpdir(), 'marmerlade-outside-'));
  try {
    await writeFile(join(outside, 'outside.md'), 'Outside');
    await symlink(join(outside, 'outside.md'), join(dir, 'link.md'));
    await assert.rejects(readRepositoryFile(dir, 'link.md'), /inside/);
    await writeFile(join(dir, '.env'), 'SECRET=value');
    await symlink(join(dir, '.env'), join(dir, 'alias.ts'));
    await assert.rejects(readRepositoryFile(dir, 'alias.ts'), /secrets/);
    await assert.rejects(readRepositoryFile(dir, '.env'), /excluded/);
  } finally { await rm(dir, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
