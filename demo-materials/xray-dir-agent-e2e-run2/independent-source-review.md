# Independent Xray source review

This review checks the agent's explanation against the local Xray checkouts.
It does not run Xray, its database, its GIS exporter, or customer data.

The API checkout is at `9d5a5fc49e28a4c665cef403b6d189a81cc01692`.
The web checkout is at `e60e9e2fb7843f8b95dd6af8de5833d8b15bd2ab`.
Both checkouts started with clean git status. The acceptance runner records the
before and after states under `agent/`.

## Intent and current implementation

- The six-stage plan preserves original geometry as the basis of Grade E output.
  It treats final GeoCUP as an audit subject and keeps uploaded grades unchanged.
  See `xray-api/docs/plans/2026-10-20-dir-six-stage-workflow.md:18` and the later
  `xray-api/docs/plans/2026-10-21-dir-stage2-geocup-anchor.md:18`.
- The current settings page mounts `DirWorkflowV3Panel`. Older panels remain under
  Previous DIR studies. See
  `xray-web/app/projects/[id]/settings/ProjectSettings.tsx:1313` and
  `DirStageNav.tsx:5` in the same directory.
- New v3 setup requires one highest-version final import and a confirmed original
  baseline category/version group. The group must not contain final layers.
  It resolves all matching baseline layers, including separate imports.
  See `xray-api/app/services/dir_workflow_v3.py:410`.
- Working areas select whole features that touch the saved area. They do not
  clip uploads. The final-GeoCUP area uses a 10 metre buffer. See
  `xray-api/app/services/dir_workflow_v3.py:49` and `:445`.
- Current Stage 2 uses final GeoCUP anchors. Manholes use centroid distance;
  alignments use the largest final-vertex offset from baseline geometry.
  TOPO is optional evidence. Within-tolerance comparisons and some polygon
  manhole matches are confirmed automatically. See
  `xray-api/app/services/dir_workflow_v3.py:253`, `:302`, `:333`, and `:663`.
- The deviation rule is read from `DIR_DEVIATION` for `R3_2026`. The spec describes
  600 mm, but this run cannot prove the live database value. See
  `xray-api/app/services/dir_study.py:673`.
- Stages 1–5 can be skipped with a reason and must progress in order. Stage 1
  Grade D defaults are local to the study and original baseline. Stage 3 bulk
  confirmation validates pending evidence before writing. Stage 5 completes
  even when final alignments have missing source grades. See
  `xray-api/app/services/dir_workflow_v3.py:168`, `:606`, `:653`, `:732`, and `:831`.
- Stage 6 requires earlier stages to be completed or skipped, current source
  hashes, and reviewed findings. Current v3 compilation takes qualifying Stage 2
  original lines and polygons. It excludes rejected and generic-node findings.
  Generated layers are `S6_DIR/DIR_CLIN` and `S6_DIR/DIR_NODE`, with Grade E.
  See `xray-api/app/services/dir_workflow_v3.py:1008` and
  `xray-api/app/services/dir_study.py:816`.
- Report download and GIS export are separate actions after compilation. GDB
  export requires generated layer IDs. All-skipped output states that no accuracy
  assessment occurred. See `xray-api/app/services/dir_study.py:1000`, `:1080`, and
  `xray-web/app/projects/[id]/settings/DirReportActions.tsx:19`.

The agent's wiki preserves these distinctions. It also identifies the Kiro icon
as authoring context and the imported globe as generic public artwork. Neither
is presented as an Xray processing service or a customer map.

## Material differences from older plans

The current baseline category/version selection is narrower than older language
about running without an independent baseline or selecting an independent import
with the same category and version as final data. Stage 5 is an audit, rather
than a hard completeness gate. Original-only missing counts do not automatically
create Grade E geometry in the current Stage 2 method. Historical study counts
and defects in plans are not findings from this run.
