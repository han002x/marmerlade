# Explain a repository with Marmerlade

Requires Node.js 22.12 or newer and a local Git checkout to inspect. Diagram
generation needs no API key, ffmpeg, Python, or running source application.

## Set up your agent

From a built Marmerlade checkout:

```bash
npm ci
npm run build
node dist/cli.js setup --client codex --repo /absolute/path/to/your-project
```

Choose `codex`, `claude-code`, or `kiro`. Kiro setup targets its IDE workspace
configuration. Setup is project-scoped and registers absolute paths for the
Node executable, packaged CLI, repository, and workspace file. Keep that
Marmerlade installation available while the client uses it.

| Client | Configuration | Workflow skill |
| --- | --- | --- |
| Codex | `.codex/config.toml` | `.agents/skills/marmerlade/SKILL.md` |
| Claude Code | `.mcp.json` | `.claude/skills/marmerlade/SKILL.md` |
| Kiro IDE | `.kiro/settings/mcp.json` | `.kiro/skills/marmerlade/SKILL.md` |

Existing settings and other servers are retained. Changed configuration files
get a backup beside the original. TOML/JSON formatting may change; malformed
configuration is refused. A customized skill is preserved and setup asks you
to move or rename it before replacing it. Setup probes an isolated workspace
through the real MCP transport and checks the built browser app. It does not
launch or test a chat session inside the selected agent.

Use `--dry-run` to list changes without writing. Use `--remove` with the same
client and repository to remove the server and unmodified bundled skill while
keeping workspace files. Existing client registration policies, project trust,
and restart/reconnect requirements still apply.

## Install a packaged build in one command

The package is not assumed to be published on npm. Build a local tarball with
`npm pack`, then run this from any directory:

```bash
npx --yes --package /absolute/path/to/marmerlade-0.1.0.tgz marmerlade setup --client codex --repo /absolute/path/to/your-project
```

This installs the package's Node dependencies and registers the resulting CLI.
The registration uses its npm cache location; rerun setup if that cache is
removed. For a permanent installation, install the tarball into a dedicated
directory with `npm install --prefix /path/to/tools /path/to/marmerlade-0.1.0.tgz`
and run `/path/to/tools/node_modules/.bin/marmerlade setup` with the same flags.
Do not install Marmerlade into the source application's dependencies unless you
want it recorded there.

## Review and generate

In your coding agent, ask Marmerlade to explain a selected workflow. The bundled
skill tells the agent to inspect manifests, documentation and relevant source
before drafting. The repository tools return bounded text and file/line
references; they do not infer verified runtime behavior from code alone.

The agent asks about missing audience, outcome, and workflow details, then
calls `create_brief`. This saves a draft without changing the canvas. The brief
contains the proposed graph, ordered connections, evidence, assumptions, and
exports. Its review URL is available through `get_brief` and
`open_workspace` with `view: "brief"`.

Open the review page and choose **Request changes** or **Approve and generate**.
Feedback is saved for the agent to read. Approval saves the reviewed graph and
approval record in one atomic write. A replaced brief or a changed canvas
cannot be approved through a stale review. Repeating an approval does not
regenerate over subsequent manual edits. The brief and workspace revision
survive a server restart.

Generation replaces the current graph and retains existing wiki pages and
slide decks. The review page states when an existing diagram will be replaced.
An approved brief remains a record of the original proposal; later canvas edits
do not silently rewrite that proposal. There is no approval MCP tool. Approval
is a user action on the browser review page, not something the agent should
submit on the user's behalf.

## Edit, play and export

Open the generated canvas. Rename, move, connect, fold, or undo through the
existing editor. Play its ordered connections with **Play flow** or `P`.
The agent can also make ordinary requested edits with the revision-based tools.

- **Mermaid** preserves the flowchart's semantic nodes and connections even when
  groups are folded. Layout, fold state, styles and playback settings belong in
  the workspace JSON. The existing flowchart syntax subset still applies.
- **SVG / PNG** under **More actions** captures the visible graph, with the
  diagram fitted to the viewport and editing controls removed. SVG uses an
  embedded HTML canvas representation; use PNG where the destination does not
  support SVG `foreignObject`. Embedded images work without a remote host;
  remote images require CORS access. Failed captures report an error.
- **GIF** records the existing flow playback. **Export file** saves a portable
  diagram with positions, styling, pages and decks.

## Run a preview without an MCP client

```bash
node dist/cli.js preview --file /absolute/path/workspace.marmerlade.json
```

This opens the browser and stays in the foreground until Ctrl+C. Use `--no-open`
on a headless machine or `--port 5173` for a fixed port. The default chooses a
free loopback port. The CLI reports the URL even when browser opening fails.
The readiness endpoint is `/api/health`. Stop another process that owns the
same workspace before starting a standalone preview.

A loopback URL opens on the machine running Marmerlade. Forward that port when
your agent runs remotely. A local server on another machine cannot open a tab
on your desktop by itself.

Brief drafts, feedback, approval and diagram are persisted together. Interrupted
writes leave the previous saved state intact; restart with the same `--file`.
Canvas synchronization retains its existing draft/conflict recovery controls.
Video recording, narration and generated artwork remain separate workflows.

## Verification

```bash
npm run lint
npm test
npm run test:mcp
npm run build
npx playwright install chromium
npm run test:setup
npm run test:mcp:integration
npm run test:e2e
```

Setup tests exercise the built CLI with isolated Codex, Claude Code and Kiro
configuration fixtures. Integration tests use a real MCP SDK client and
Chromium to review, revise, approve, play, edit, export and reopen a workspace.
These checks do not claim native Windows/macOS or live agent-chat validation.
