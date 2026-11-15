import { useEffect, useState } from 'react';
import { briefStatusSchema, type BriefReview } from '../briefSchema.ts';
import { bootstrapSchema } from '../workspaceSchema.ts';
import { toMermaid } from '../mermaid/io.ts';
import Preview from '../wiki/Preview.tsx';
import './brief.css';

type Status = ReturnType<typeof briefStatusSchema.parse>;
export default function BriefApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/brief', { signal: abort.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Cannot load the brief. Open the live workspace URL supplied by your assistant.');
        setStatus(briefStatusSchema.parse(await response.json()));
      } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Cannot connect'); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 1500);
    return () => { clearInterval(timer); abort.abort(); };
  }, []);
  async function review(action: BriefReview) {
    setBusy(true); setError('');
    try {
      const bootstrap = await fetch('/api/bootstrap', { cache: 'no-store' });
      if (!bootstrap.ok) throw new Error('Cannot connect to the workspace');
      const { token } = bootstrapSchema.parse(await bootstrap.json());
      const response = await fetch('/api/brief/review', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Marmerlade-Token': token }, body: JSON.stringify(action) });
      if (!response.ok) {
        const message = await response.json();
        throw new Error(typeof message.error === 'string' ? message.error : 'Review could not be saved');
      }
      setStatus(briefStatusSchema.parse(await response.json()));
      setRequesting(false); setFeedback('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review could not be saved'); }
    finally { setBusy(false); }
  }
  const brief = status?.brief;
  const stale = brief?.kind === 'draft' && brief.basedOn !== status?.revision;
  return <main className="mf-brief">
    <header><a href="#/" className="mf-brief-brand">marmerlade</a><a href="#/">Open canvas</a></header>
    {error && <p role="alert">{error}</p>}
    {!status && !error && <p>Loading brief…</p>}
    {status && !brief && <section><h1>No brief yet</h1><p>Ask your assistant to explain a repository or workflow with Marmerlade.</p></section>}
    {brief && <>
      <section className="mf-brief-intro">
        <p className="mf-brief-status">{brief.kind === 'generated' ? 'Approved and generated' : brief.kind === 'changes_requested' ? 'Changes requested' : 'Review brief'}</p>
        <h1>{brief.content.title}</h1><p>{brief.content.goal}</p>
        <dl><dt>Audience</dt><dd>{brief.content.audience}</dd><dt>Workflow</dt><dd>{brief.content.workflow}</dd><dt>Exports</dt><dd>{brief.content.outputs.join(', ').toUpperCase()}</dd></dl>
      </section>
      <section className="mf-brief-preview" aria-label="Proposed diagram"><Preview body={'```mermaid\n' + toMermaid(brief.diagram) + '\n```'} /></section>
      <section><h2>Playback</h2><ol>{[...brief.diagram.edges].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(edge => <li key={edge.id}>{brief.diagram.nodes.find(node => node.id === edge.source)?.label} → {brief.diagram.nodes.find(node => node.id === edge.target)?.label}{edge.label ? ` · ${edge.label}` : ''}</li>)}</ol>{brief.diagram.edges.length === 0 && <p>This diagram has no connection sequence.</p>}</section>
      <section><h2>Repository evidence</h2><ul>{brief.content.evidence.map((item, i) => <li key={i}><code>{item.path}:{item.line}</code><p>{item.note}</p></li>)}</ul></section>
      <section><h2>Assumptions</h2>{brief.content.assumptions.length ? <ul>{brief.content.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>No unresolved assumptions declared.</p>}</section>
      <details><summary>Mermaid source</summary><pre>{toMermaid(brief.diagram)}</pre></details>
      {brief.kind === 'changes_requested' && <section role="status"><h2>Your feedback</h2><p>{brief.feedback}</p><p>Your assistant can read this feedback and propose a revised brief.</p></section>}
      {brief.kind === 'generated' && <section className="mf-brief-actions"><p>Generated from the approved brief. Canvas edits are saved separately from this proposal.</p><a href="#/" className="mf-brief-primary">Open editable canvas</a></section>}
      {brief.kind === 'draft' && <section className="mf-brief-actions">
        {stale ? <p role="status">The canvas changed after this brief was drafted. Ask your assistant to refresh the brief before approving.</p> : <p>{status && status.nodeCount > 0 ? 'Approval replaces the current diagram. Existing wiki pages and slide decks are retained.' : 'Approval creates this editable diagram with flow playback.'}</p>}
        <div className="mf-brief-buttons"><button className="mf-brief-primary" disabled={busy || stale} onClick={() => { void review({ id: brief.id, action: 'approve' }); }}>{busy ? 'Saving…' : 'Approve and generate'}</button><button disabled={busy} onClick={() => setRequesting(value => !value)}>Request changes</button></div>
        {requesting && <form onSubmit={event => { event.preventDefault(); void review({ id: brief.id, action: 'request_changes', feedback }); }}><label htmlFor="brief-feedback">What should change?</label><textarea id="brief-feedback" value={feedback} onChange={event => setFeedback(event.target.value)} maxLength={4000} required autoFocus /><button disabled={busy || !feedback.trim()} type="submit">Send feedback</button></form>}
      </section>}
    </>}
  </main>;
}
