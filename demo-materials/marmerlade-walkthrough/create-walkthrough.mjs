import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const { endpoint } = JSON.parse(await readFile(directory + 'session.json'));
async function call(name, args = {}) {
  const response = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ name, args }) });
  const result = await response.json();
  if (!response.ok || result.isError) throw new Error(JSON.stringify(result));
  return result.data;
}
let workspace = await call('get_workspace');
if (workspace.diagram.nodes.length) throw new Error('Use a new workspace; this script preserves existing work.');
const source = `flowchart LR
  subgraph create ["1. Create your diagram"]
    source["Open Mermaid · M"] -->|edit source| tidy["Arrange with Tidy"]
  end
  subgraph explore ["2. Explore the detail"]
    fold["Fold or unfold · F"] -->|trace connections| play["Play the flow · P"]
  end
  subgraph explain ["3. Add the explanation"]
    wiki["Open linked notes · W"] -->|prepare a walkthrough| slides["Open linked slides · K"]
  end
  subgraph share ["4. Share your work"]
    save["Export workspace file"] -->|make an animation| gif["Export GIF"]
  end
  tidy -->|inspect| fold
  play -->|add context| wiki
  slides -->|keep and share| save
`;
workspace = await call('import_mermaid', { revision: workspace.revision, source });
const pages = [
  { id: 'start', title: 'Start here', body: `# Your first Marmerlade walkthrough

Turn a diagram into a workspace people can explore.

This canvas shows a new user's journey. Four folded cards keep the overview short. Open a card to see its actions.

1. Select a group and press **F** to unfold it. Use **[** and **]** to fold or unfold one level across the canvas.
2. Select **1. Create your diagram** and press **W**. Its page picker includes this guide and **Create a diagram**.
3. Follow the arrows through **Explore**, **Explain**, and **Share**.
4. Press **P** to play the connections. Use **,** and **.** to step through them.

Read [[Create a diagram]], [[Explore a diagram]], [[Add notes and slides]], or [[Save and share]].

## Work with an assistant

This workspace was created through the local Marmerlade MCP server. The assistant used revision-checked Mermaid imports and document edits. A connected browser follows those edits.

The server saves this workspace to **walkthrough.marmerlade.json**. The ordinary development app uses separate browser storage.

Product references: [User guide](https://github.com/han002x/merfolk/blob/main/docs/usage.md) and [MCP setup](https://github.com/han002x/merfolk/blob/main/docs/mcp.md).` },
  { id: 'create_notes', title: 'Create a diagram', body: `# Create your diagram

{{diagram:create}}

Press **M** to toggle the panel and choose **Mermaid**. Edit the source to update the canvas.

Try this in a separate workspace:

\`\`\`mermaid
flowchart LR
  question[Customer question] --> search[Search notes]
  search --> answer[Write answer]
\`\`\`

Use the panel's **Tidy** button, or the toolbar's **Tidy and fold** menu, to arrange nodes. Drag a node to adjust it. Double-click its label to rename it.

The toolbar also creates shapes, icons, and images. You can edit visually and return to Mermaid source.

Next: [[Explore a diagram]].` },
  { id: 'explore_notes', title: 'Explore a diagram', body: `# Explore the detail without losing the overview

{{diagram:explore}}

Select a group and press **F**. Folding hides its children and brings outside connections onto the folded card. Unfold it to inspect its steps.

Press **[** to fold a level and **]** to unfold a level. Nest groups when the next level needs more detail.

Press **P** to play the flow. Use **,** and **.** to move between flow steps. Playback illustrates the connections; it does not run the actions named on these cards.

Next: [[Add notes and slides]].` },
  { id: 'explain_notes', title: 'Add notes and slides', body: `# Keep the explanation with the diagram

{{diagram:explain}}

## Add a wiki page

Select a node and press **W**. The **Page** tab opens its default linked page, or creates a page when none exists.

Use **New page** for another topic or **Link existing page** to share a page between nodes. Try the page picker on **1. Create your diagram** to switch between its two linked guides.

Use **[[Start here]]** to navigate by wiki link. A page can embed the current sub-diagram with the literal text \`{{diagram}}\` on its own line. An explicit target such as \`{{diagram:create}}\` keeps the embed attached to that group.

## Build slides when you need to present

Select a node and press **K**. Write slides as Markdown, separated by \`---\` on its own line with blank lines around it. Diagram embeds can appear in slides too.

Open the deck in its own window for **Present**, speaker notes, and **Export Markdown**. Print while presenting to make a PDF.

This walkthrough includes wiki guides. It leaves slide creation as a step for the reader.

Next: [[Save and share]].` },
  { id: 'share_notes', title: 'Save and share', body: `# Choose the export for your reader

{{diagram:share}}

## Keep an editable workspace

Choose **More actions → Export file** for a complete **.marmerlade.json** workspace. It retains positions, folds, styles, wiki pages, and slide decks. Use **Import file** to open it elsewhere. Import replaces that destination's workspace.

## Share an animated diagram

Press **P** to start the flow, then choose **More actions → Export GIF**. The result is an animation of the diagram, rather than a recording of the app's controls.

## Reuse the structure

Use **Copy** in the **Mermaid** tab for Mermaid source. It carries structure and document references. Keep the workspace JSON when you also need document bodies and styling.

An MCP workspace saves to its JSON file after edits. Browser-only work saves in localStorage until you export it.

Return to [[Start here]].` },
];
const groups = ['create', 'explore', 'explain', 'share'];
const palette = [ ['#99502c','#fff0df'], ['#356c72','#e9f4f2'], ['#536b3d','#eff3e6'], ['#795968','#f6edf1'] ];
const links = { create: ['start','create_notes'], explore:['explore_notes'], explain:['explain_notes'], share:['share_notes'] };
const nodePages = { source:['create_notes'], tidy:['create_notes'], fold:['explore_notes'], play:['explore_notes'], wiki:['explain_notes'], slides:['explain_notes'], save:['share_notes'], gif:['share_notes'] };
workspace = await call('apply_changes', { revision: workspace.revision, changes: [
  ...pages.map(document => ({ kind: 'put_page', document })),
  ...workspace.diagram.nodes.map(node => {
    const index = groups.indexOf(node.parentId ?? node.id);
    const [stroke, background] = palette[index];
    return { kind: 'put_node', node: { ...node, collapsed: groups.includes(node.id), pageIds: links[node.id] ?? nodePages[node.id], style: { stroke, background, fontFamily:'hand', fontSize:20, sloppiness:1, strokeWidth:1.7 } } };
  }),
  ...workspace.diagram.edges.map(edge => ({ kind:'put_edge', edge:{ ...edge, order:['source','tidy','fold','play','wiki','slides','save'].indexOf(edge.source)+1, style:{ stroke:'#5c625b', fontFamily:'sans', fontSize:14, animation:'flow', animationSpeed:1.8 } } })),
] });
workspace = await call('layout_diagram', { revision: workspace.revision, direction:'TB' });
await writeFile(directory + 'walkthrough.mmd', (await call('export_mermaid')).source);
console.log(JSON.stringify({ revision: workspace.revision, nodes: workspace.diagram.nodes.length, pages: workspace.diagram.pages.length, url:(await call('get_workspace')).url }));
for (const [name, options] of [
  ['overview', { fold:'current', width:1000, height:1000 }],
  ['expanded', { fold:'expanded', width:1000, height:1800 }],
  ['guide', { view:'wiki', id:'start', nodeId:'create', width:1440, height:1000 }],
  ['linked-notes', { view:'wiki', id:'explain_notes', nodeId:'explain', width:1440, height:1200 }],
]) {
  const preview = await call('render_preview', { revision:workspace.revision, ...options });
  await writeFile(directory + `${name}-preview.json`, JSON.stringify(preview, null, 2));
  console.log(JSON.stringify({name,...preview}));
}
