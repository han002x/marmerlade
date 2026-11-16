import { writeFile } from 'node:fs/promises';

// A fictional support team explains one question at three levels of detail,
// opens the documents linked to the same nodes, and exports the animated canvas.
const palette = {
  orange: { stroke: '#ffaf62', background: '#35231d' },
  violet: { stroke: '#c4a3ff', background: '#2b203b' },
  green: { stroke: '#a9d47a', background: '#243121' },
};
const node = (id, label, icon, x, y, color = 'orange', parentId = null, links = {}) => ({
  id, label, shape: 'round', icon, parentId, collapsed: false,
  position: { x, y },
  style: { ...palette[color], fontFamily: 'sans', fontSize: 14, sloppiness: 1, animation: 'pulse', animationSpeed: 2.4 },
  ...links,
});
const page = (id, title, body) => ({ id, title, body, updatedAt: 1794528000000 });
export const fixture = {
  version: 3,
  diagram: {
    nodes: [
      node('Question', 'Customer question', 'lucide:message-square', 20, 200, 'orange', null, { pageIds: ['overview'] }),
      node('Kiro', 'Kiro agent', 'logos:kiro', 220, 200, 'violet', null, { pageIds: ['agent_design', 'runbook'], deckIds: ['architecture'] }),
      node('Retrieval', 'Retrieve knowledge', 'lucide:folder', 440, 120, 'violet', null, { collapsed: true, pageIds: ['retrieval', 'runbook'], deckIds: ['architecture'] }),
      node('Rewrite', 'Rewrite query', 'lucide:sparkles', 440, 120, 'violet', 'Retrieval'),
      node('Search', 'Hybrid search', 'lucide:layers', 650, 120, 'violet', 'Retrieval', { collapsed: true, pageIds: ['search'] }),
      node('GitHub', 'GitHub docs', 'simple-icons:github', 650, 120, 'violet', 'Search', { pageIds: ['search'] }),
      node('Index', 'Vector index', 'lucide:database', 650, 340, 'green', 'Search'),
      node('Merge', 'Merge evidence', 'lucide:git-branch', 860, 230, 'violet', 'Search'),
      node('Rank', 'Rank sources', 'lucide:layers', 1070, 230, 'violet', 'Retrieval'),
      node('Draft', 'Draft answer', 'lucide:bot', 1270, 230, 'orange'),
      node('Check', 'Check citations', 'lucide:shield', 1470, 230, 'green', null, { pageIds: ['contract'] }),
      node('Reply', 'Customer reply', 'lucide:mail', 1670, 230, 'green', null, { pageIds: ['contract'], deckIds: ['architecture'] }),
    ],
    edges: [
      ['Question', 'Kiro', 'ask'], ['Kiro', 'Rewrite', 'retrieve'],
      ['Rewrite', 'GitHub', 'exact terms'], ['Rewrite', 'Index', 'semantic query'],
      ['GitHub', 'Merge', 'docs'], ['Index', 'Merge', 'matches'],
      ['Merge', 'Rank', 'evidence'], ['Rank', 'Draft', 'sources'],
      ['Draft', 'Check', 'draft'], ['Check', 'Reply', 'approved'],
    ].map(([source, target, label], i) => ({ id: `e${i}`, source, target, label, style: { stroke: '#b692cd', strokeWidth: 2, sloppiness: 1, animation: 'flow', animationSpeed: 2.4 } })),
    pages: [
      page('overview', 'The haunted help desk', '# The haunted help desk\n\nA fictional support workflow for Harbor Notes.\n\n**Question:** How do I export my workspace?\n\nThe [[Kiro agent design]] describes how the assistant retrieves evidence before it writes a reply.\n\n## One connected workspace\n\nExplore the diagram, read the linked design notes, then open the architecture deck.'),
      page('agent_design', 'Kiro agent design', '# Kiro agent design\n\nOne customer question. A grounded, cited answer.\n\n## How the agent works\n\n1. **Retrieve** documentation and related passages.\n2. **Draft** an answer from the ranked sources.\n3. **Check** citations before sending the reply.\n\n## Connected knowledge\n\nRead the [[Retrieval design]] or follow the [[Support runbook]]. Both pages are linked to the canvas.\n\n> Fold the system for the big picture. Unfold a group when you need the details.\n\n## Answer contract\n\nEvery reply follows the shared [[Response contract]].'),
      page('retrieval', 'Retrieval design', '# Retrieval design\n\nCombine exact product terms with semantic matches.\n\n## Two complementary sources\n\n| Source | Purpose |\n| --- | --- |\n| GitHub docs | Approved product documentation |\n| Vector index | Related passages and wording |\n\nMerge the results, remove duplicates, then rank the evidence.\n\nSee [[Hybrid search]] for the branch details.\n\n{{diagram:Search}}'),
      page('search', 'Hybrid search', '# Hybrid search\n\nRun keyword and vector retrieval for the same customer question.\n\n## Search paths\n\n- **GitHub docs** preserve exact feature names.\n- **Vector index** finds related wording.\n- **Merge evidence** combines both result sets.\n\nThe parent [[Retrieval design]] ranks the merged sources.\n\n{{diagram:Search}}'),
      page('runbook', 'Support runbook', '# Support runbook\n\n## When evidence is missing\n\n1. Check that GitHub documentation is available.\n2. Verify that the vector index is current.\n3. Ask a support specialist to review uncertain answers.\n\nReturn to [[Kiro agent design]] for the normal flow.'),
      page('contract', 'Response contract', '# Response contract\n\nEvery customer reply must include:\n\n- A direct answer to the question.\n- Links to the supporting documentation.\n- A clear next step if human review is required.\n\nThe [[Kiro agent design]] and reply node share this page.'),
    ],
    decks: [page('architecture', 'Inside the haunted help desk', `---
title: Inside the haunted help desk
backgroundColor: '#211a2b'
color: '#f7e6cf'
font: sans
headingFont: sans
transition: fade
---

# Inside the haunted help desk

One question. One connected workflow.

**Kiro agent · Architecture walkthrough**

---

# Retrieve. Draft. Verify.

- **Retrieve** evidence from GitHub docs and a vector index.
- **Draft** an answer grounded in ranked sources.
- **Verify** citations before sending the reply.

The diagram, wiki pages, and deck share one workspace.

---

# One diagram, three levels

| Level | What you see |
| --- | --- |
| Overview | The complete support workflow |
| Retrieval | Rewrite, search, and ranking |
| Search | GitHub docs and vector matches |

Keep the diagram and its explanation in the same workspace.

---

# Share the flow

Export an animated GIF for a README, design review, or team update.

**Keep the context. Share the motion.**`) ],
  },
};
// Reserve each group's entire expanded footprint in the captured layout.
const positions = {
  Question: [40, 40], Kiro: [40, 230], Retrieval: [340, 40],
  Rewrite: [340, 40], Search: [340, 230], GitHub: [340, 230],
  Index: [590, 230], Merge: [460, 440], Rank: [460, 640],
  Draft: [860, 40], Check: [860, 270], Reply: [860, 500],
};
for (const n of fixture.diagram.nodes) {
  const [x, y] = positions[n.id];
  n.position = { x, y };
}
// Fail early if a requested icon is absent from the app's actual catalog.
const { readFile } = await import('node:fs/promises');
const catalog = await readFile(new URL('../../src/icons/catalog.ts', import.meta.url), 'utf8');
for (const n of fixture.diagram.nodes) {
  if (!catalog.includes(`"id": "${n.icon}"`)) throw new Error(`Icon unavailable: ${n.icon}`);
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await writeFile(new URL('../fixtures/halloween.marmerlade.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
}
