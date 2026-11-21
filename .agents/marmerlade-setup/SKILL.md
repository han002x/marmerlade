---
name: marmerlade-setup
description: Install, connect, diagnose, and verify a local Marmerlade workspace for Codex, Kiro, Claude Code, Cursor, or Antigravity. Use for first-run setup, missing dependencies, MCP connection failures, or opening a project on the user's machine.
---

# Marmerlade setup

Prepare the local machine, verify the connection, then hand the project to
`marmerlade-director`. Use the host agent's shell; a Marmerlade MCP tool cannot
bootstrap a server that has not been installed or connected yet.

## 1. Locate the project and host

Inspect the project, existing MCP configuration, and available local tools.
Use the agent the user is running. `both` configures only Codex and Kiro;
name any other agent explicitly.

| Value | MCP configuration | Skills |
| --- | --- | --- |
| `codex` | `.codex/config.toml` | `.agents/skills` |
| `kiro` | `.kiro/settings/mcp.json` | `.kiro/skills` |
| `claude` | `.mcp.json` | `.claude/skills` |
| `cursor` | `.cursor/mcp.json` | `.cursor/skills` |
| `antigravity` | `~/.gemini/antigravity/mcp_config.json` (user-level) | `.agent/skills` |

Antigravity's MCP file is outside the project and shared by every workspace. Use a
distinct `--name` per project there.

Confirm the project directory is on the machine where the browser should open.
A remote container's localhost is not automatically the user's desktop.

Choose the workspace file and preserve existing work. Discover a native image
tool or already configured image-generation MCP in the host's tool list. Record
its availability separately from Marmerlade runtime readiness. Do not install
a paid provider or ask for credentials in chat. If no provider exists, report
that missing capability and continue with editable diagrams and supplied assets.

## 2. Install or reuse dependencies

Use an existing compatible package first. Requirements are Node.js 22.12 or
newer, npm, and Playwright Chromium for native previews, image import, layout,
and GIF rendering. The package includes the built web app and four skills.
No local image model, GPU runtime, Python, or FFmpeg is required.

With the npm package installed (`npm install -g marmerlade`):

```bash
marmerlade setup --project /absolute/project --host claude --file architecture.marmerlade.json
```

From a built source checkout:

```bash
node /absolute/path/to/marmerlade/dist/cli.js setup --project /absolute/project --host kiro --file architecture.marmerlade.json
```

If Node or the built package is missing, use the supplied bootstrap script.
POSIX from a source checkout:

```bash
bash /absolute/path/to/marmerlade/scripts/bootstrap.sh --project /absolute/project --host codex --file architecture.marmerlade.json
```

Windows PowerShell from a source checkout:

```powershell
& C:\path\to\marmerlade\scripts\bootstrap.ps1 -Project C:\project -AgentHost kiro -WorkspaceFile architecture.marmerlade.json
```

For a trusted release tarball, pass `--package /path/release.tgz` to the POSIX
script or `-Package C:\path\release.tgz` to PowerShell. Bootstrap downloads a
user-local Node 22 runtime only when needed and verifies its archive against
the official Node.js SHA-256 manifest. Source bootstrap runs npm ci and build.
Do not assume a public npm release exists merely from the package name.

Setup installs Chromium when needed, copies skills into `.agents/skills` for
Codex and `.kiro/skills` for Kiro, and merges project-scoped MCP configuration.
It uses absolute runtime, CLI, and workspace paths. Existing configurations are
backed up before modification. Different existing entries or skill instructions
cause a specific conflict; select another `--name` or use `--replace` only when
the user's requested replacement covers that entry. Do not silently overwrite
another workspace's connection.

**Done:** setup's runtime checks and child-MCP smoke check pass. A repeated setup
preserves existing configuration. Host reload and image-tool availability are
still separate checks.

## 3. Connect and diagnose

Reload the selected agent's MCP connection and skills using the host's available
controls. If only the user can reload that host, give the exact next step.
Call `get_workspace` and `diagnose_environment` after reconnecting.

If MCP cannot start, run the same checks outside MCP:

```bash
node /absolute/path/to/marmerlade/dist/cli.js doctor --file /absolute/project/architecture.marmerlade.json
```

Follow the returned checks and command/argument fixes. A missing browser library
can require an OS package manager and host permission. Do not bypass that host's
installation rules. CLI diagnostics cannot discover the host's image-generation
tools; inspect those through the agent instead.

**Done:** the tools are actually callable, the expected workspace path is
returned, Chromium launches, and the image capability is either available or
explicitly reported as missing. A configuration file existing is not proof of
connection.

## 4. Open and hand off

Use `open_workspace` after the director has prepared the intended view. It
returns a local URL even when automatic browser opening fails. Report that URL
instead of claiming the desktop window is visible. Verify the app through
`render_preview` and inspect its diagnostics.

For a browser app independent of an agent session, use:

```bash
node /absolute/path/to/marmerlade/dist/cli.js serve --file /absolute/project/architecture.marmerlade.json --open
```

Keep one server process per workspace file. Stop the MCP instance before serving
that same file independently. Do not delete active locks. The ordinary dev
app's localStorage is a separate workspace.

**Done:** provide the local URL, workspace location, connection status, and any
specific remaining host-only action. Continue with `marmerlade-director` to
discuss requirements and create the project, or `marmerlade-codebase-map` to map
an existing repository.
