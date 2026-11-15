# DEVH-29 implementation checkpoints

- [x] Read the existing architecture and capture baseline workspace and package checks.
- [x] Add repository evidence and a durable brief with browser approval.
- [x] Add project-scoped client setup, a bundled workflow skill, and MCP readiness checks.
- [x] Add review UI and SVG/PNG downloads alongside existing Mermaid and flow playback.
- [x] Verify actual MCP calls, browser approval and edits, export, restart, setup repetition, and package installation.
- [x] Prepare the branch and supervised local preview for PR delivery.

Acceptance: starting from the packaged CLI, setup preserves existing client settings; an agent can inspect the selected repository and propose an evidenced brief; the browser can request changes or approve the exact brief; approval creates the editable animated diagram; SVG, PNG, Mermaid, and workspace exports remain available after edits. Reject stale approval and preserve edits across restart. Actual client chat sessions are a separate compatibility check when those clients are available.

Use the existing graph and playback model. Persist the brief alongside the diagram in the workspace envelope. Keep approval out of MCP tools, with a browser action that records the reviewed revision and atomically generates its diagram. Run existing checks before and after the change, then exercise the packaged workflow with a real MCP SDK client and Chromium.

Verified on Linux with Node 24: existing unit suites, workspace and brief tests,
all 33 existing Playwright tests, the complete MCP/browser workflow, all three
client setup formats, and a clean runtime-only tarball installation. The preview
uses a real source-based draft awaiting user review. Interactive agent chats,
native Windows/macOS behavior, and npm publication remain outside the verified
result. No independent model review tool was available; the delivery requires
human PR review.
