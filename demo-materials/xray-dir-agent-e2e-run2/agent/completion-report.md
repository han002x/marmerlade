# Xray DIR acceptance completion

The resumed local acceptance run is complete. The authored model, wiki, deck, images, styles, and stable IDs were preserved. The fresh MCP session loaded the existing saved file before any edits. Its initial revision was 0. The final revision is 4, after temporary fold changes and restoration.

## Delivered files

The editable project is [xray-dir.marmerlade.json](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/project/xray-dir.marmerlade.json). It contains 26 nodes, 18 edges, eight wiki pages, and one five-slide deck. The saved starting view expands Review stages while folding geometry, setup, compilation, and outputs.

The [Mermaid export](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/project/marmerlade-output/xray-dir.mmd) was produced by export_mermaid. The real Marmerlade parser accepted it. Node IDs, labels, parents, edge endpoints and labels, and page/deck references match the saved model. Mermaid omits document bodies, positions, saved folds, styles, and flow order. Keep the JSON for complete editing.

The final [native GIF](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/project/marmerlade-output/diagram-c03134d6-12e2-49eb-9d8b-7b97f7ab7d09.gif) is job c03134d6-12e2-49eb-9d8b-7b97f7ab7d09, pinned to revision 4. It was polled through running to complete. It is 1200×1200, 6,153,520 bytes, with 28 frames, 250 ms per frame, and an infinite seven-second loop. All frames decoded. Twenty-seven frames differ. Start, intermediate, and final frames were inspected, and browser playback continued past one full loop. A [frame sheet](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/project/marmerlade-output/final-gif-frames.png) is saved.

The [artifact manifest](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/agent/artifacts.json) records every final preview path, render request, revision, diagnostics, file size, and hash. The [brief](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/agent/brief.md) and [source report](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/agent/source-grounding-report.md) complete the handoff.

## Checks performed

The current, expanded, and collapsed canvas previews pass at 1800×1800. Two mixed views also pass. One opens geometry inside Review stages while other top-level groups stay folded. The other opens compilation and outputs while geometry stays folded. All saved folds were restored through MCP.

All eight wiki pages were rendered in Read mode and visually inspected. Their attachments resolve. The geometry map embed renders its intended subtree. All five slides were rendered in Present view and visually inspected after the finite-animation capture fix. Their text is visible and legible.

Across the 18 final previews, overlaps, clipping, small labels, failed images, and browser errors are empty. No content overflow was reported. Images, not just diagnostics, were inspected.

The live browser check followed overview to setup, geometry map to geometry, and slide 5 to its Intent and verification wiki window. The embed was visible and no page errors occurred. The live check used the existing MCP server and an isolated browser context with Halloween appearance.

The imported original SVG remains at assets/xray-public-globe.svg. Its 1,035 bytes match Xray web's public/globe.svg and the embedded image. Its SHA-256 is b614b9bf183925957661ac851498fe1d8029fd43a62fbfed86f9e2624a57e7cf. The prior import_image tool result is retained in prior-render-attempts.json. No repeat import was needed.

The prior run called layout_diagram in LR mode. Its later authored layout was retained and checked again. The actual catalog Kiro icon stays outside the Xray processing path in an explicit authoring/tool node. The host exposes image_gen.imagegen. It was not called.

The final get_workspace returned the saved file at revision 4. Every entity matches the fresh-session initial snapshot by ID, including document bodies and timestamps. Array order can change after MCP puts. The runtime parser, graph references, 22 wikilinks, one embed, source citation paths and line bounds, and Mermaid structure pass the rerunnable file check.

## Earlier attempts and their disposition

- The original expanded preview request used width 2600 and failed input validation. The supported maximum is 2400.
- The original focused canvas request with nodeId geometry returned small-label diagnostics. It was not accepted as a focused final image. The mixed geometry view and explicit wiki diagram embed provide the readable drill-down.
- An earlier slide 5 PNG, preview-94ae62f2-64cf-47c2-bb84-bbd5e47e6f2c.png, is visibly dim despite clean diagnostics. Fresh previews after the renderer fix finish finite animations. All five final slides were inspected and accepted.
- Original GIF job 2e51cfc9-3f6c-418d-85dd-02966d8bf1b3 failed with the render memory-budget error. It used 10 fps and maxWidth 1200.
- Original jobs f4a66aeb-1de1-4802-b12b-0be7ab292ab5 and 4054c812-8f6e-49ce-b0e1-9b991a73f600 were queued. GIF files exist, but the terminated process recorded no completion polls for them. They are not final acceptance evidence, and their old job IDs were not polled in this session.
- The fresh session's first current preview at 1600×1000 reported small labels. It was superseded by the accepted 1800×1800 version.
- Fresh GIF job 15dc750a-8250-4748-a039-b66b850a8853 completed. Its default 900×563 framing made labels small, so it was superseded by the larger final GIF.
- Four extra live-browser check attempts failed because the check assumed the wrong accessible role, title element, or window behavior. Read is a tab, page titles are textboxes, and slide wiki links open a wiki window. The corrected browser check passed. These were check-locator failures. The full details are in browser-checks.json.
- Two auxiliary shell checks used an unavailable python command. They were rerun with python3. They did not modify the workspace.

The original native call records and their diagnostics are in [prior-render-attempts.json](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/agent/prior-render-attempts.json). Fresh results are in [acceptance-evidence.json](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/agent/acceptance-evidence.json), [verification-results.json](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/agent/verification-results.json), and [browser-checks.json](/home/han/projects/merfolk/demo-materials/xray-dir-agent-e2e-run2/agent/browser-checks.json).

## Local view and limits

open_workspace returned {"url":"http://127.0.0.1:46385/#/","opened":true}. This records the tool result and local URL. It does not assert that a desktop window is visible. The server must remain available for that URL. Appearance is a browser setting rather than a field in the saved JSON. The native previews and GIF explicitly use Halloween.

The rerunnable checks are node --experimental-strip-types verify-acceptance.mjs and node verify-browser.mjs from the project directory. The browser check uses the URL in acceptance-evidence.json. A later MCP server session can assign a different port. No separate workspace server was started.

Xray behavior remains source-derived. No Xray runtime, API, database rule row, migration, customer workbook, or GDB conversion was exercised. No credentials were read, no global host setting changed, and nothing was deployed.
