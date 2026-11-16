# Xray DIR source grounding

This report explains the current code inspected on 15 November 2026. It supports a local Marmerlade explanation for an Xray reviewer and an engineer. It does not claim that Xray passed runtime acceptance.

The API and web READMEs, the API AGENTS.md, the DIR spec, the six-stage plan, the later Stage 2 plan, and the relevant UI, route, service, and report code were inspected. The resumed run checked the existing wiki and deck against these sources. It retained their text and IDs.

## Current workflow

The current settings panel mounts DirWorkflowV3Panel. Previous DIR studies use the v2 and legacy panels. The API exposes additive v3 routes and checks project ownership before each workflow action. This establishes v3 as the current workflow, rather than choosing a workflow from an older plan.

Sources: [current and historical panels](/home/han/projects/xray/xray-web/app/projects/[id]/settings/ProjectSettings.tsx:1313), [v3 owner guard and routes](/home/han/projects/xray/xray-api/app/api/v1/endpoints/dir_workflow_v3.py:26), and [six stage definitions](/home/han/projects/xray/xray-api/app/services/dir_constants.py:16).

## Frozen sources and working area

Setup requires a highest numeric version final S5_GCUP import and a confirmed original baseline. Baseline selection resolves all project layers with the chosen category and version. Eligible categories are S5A_CUP and S5_GCUP. A group containing any selected final layer is rejected. A same-version separate import is therefore not sufficient when the resolved group also includes the final import.

The UI offers the buffered final area, a registered polygon boundary layer, the project boundary box, or a drawn WGS84 box. The service stores the area in EPSG:3414 and includes whole features that touch it. Source hashes are checked again during review, compilation, and report generation.

Sources: [setup checks](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:410), [area handling](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:445), [setup UI](/home/han/projects/xray/xray-web/app/projects/[id]/settings/DirStudySetup.tsx:13), [source checks](/home/han/projects/xray/xray-api/app/services/dir_study.py:365), and [whole-feature report statement](/home/han/projects/xray/xray-api/app/services/dir_study.py:1051).

## Geometry decisions

New Stage 2 analysis records geocup_anchor_v2. The candidate loop starts from eligible final GeoCUP features. It matches compatible original features by keys, then bounded spatial search. Generic nodes affect missing-data counts but do not become geometry-deviation findings. Optional surveyed covers support manholes. TOPO does not replace the original baseline.

Manholes use centroid distance. Alignments use the greatest final-vertex offset from the original geometry. This differs from symmetric Hausdorff distance. Within-tolerance findings are automatic, as are certain deviated polygon manhole matches. Other deviations need review. Rejection clears the original reference, retains a reviewed audit row, updates missing-data counts, and creates no Grade E geometry. An explicit reference-change endpoint is separate from map selection.

Sources: [matching](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:193), [measurement and automatic confirmation](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:253), [final-driven candidate loop](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:333), [stored analysis method](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:663), [review constraints](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:876), and [reference change route](/home/han/projects/xray/xray-api/app/api/v1/endpoints/dir_workflow_v3.py:135).

The documented deviation threshold is 600 mm. The code reads DIR_DEVIATION for R3_2026 at runtime. No live rule row was queried. The wiki keeps that distinction.

Source: [runtime rule lookup and 503 conditions](/home/han/projects/xray/xray-api/app/services/dir_study.py:673).

## Other stages, skips, and blocks

Stages run in order. Stages 1 through 5 can be skipped with a nonblank reason. Stage 6 remains mandatory. Stage 1 confirms the stored grade review and can record study-local Grade D defaults for ungraded original service-plan data. Stages 3 and 4 use whole investigation datasets. Stage 3 bulk confirmation validates all pending saved findings before writing. B+ requires Stage 4 and full reviewed prior non-invasive coverage. Stage 5 records missing final alignment grades and completes.

Changing sources or skipping a stage clears dependent reviews and resets Stage 6. Generated studies lock edits. Stale revisions, pending reviews, changed sources, invalid evidence, missing rules, and unsupported qualifying original geometry have explicit failures.

Sources: [prior-stage gate](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:168), [reset and source selection](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:552), [skip](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:606), [analysis and Stage 5 completion](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:632), [Stage 1 confirmation](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:732), [atomic evidence confirmation](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:831), and [B+ constraints](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:941).

## Compilation and exports

Stage 6 requires each optional stage to be completed or skipped and all stored findings reviewed. Current v3 compilation filters Stage 2 to eligible paired comparisons with an independent original baseline. It excludes rejected findings and generic nodes. Qualifying deviations copy distinct original line or polygon geometry to S6_DIR / DIR_CLIN and DIR_NODE, with Grade E attributes and links to findings. Original-only summary counts do not create geometry under the new method. Qualifying point geometry blocks compilation.

The workbook records owner summaries, grades, sources, stage states, evidence, and skip reasons. An all-skipped workflow can compile no output layers. Its workbook explicitly states that no accuracy assessment occurred. The current panel downloads Excel through the shared report endpoint and offers GDB export only when generated layer IDs exist. The separate project GeoJSON endpoint is not a second current-panel button.

Sources: [mandatory compile gate](/home/han/projects/xray/xray-api/app/services/dir_workflow_v3.py:1008), [compilation filters and output creation](/home/han/projects/xray/xray-api/app/services/dir_study.py:816), [workbook contents](/home/han/projects/xray/xray-api/app/services/dir_study.py:925), [all-skipped statement](/home/han/projects/xray/xray-api/app/services/dir_study.py:1080), [XLSX writer](/home/han/projects/xray/xray-api/app/services/dir_report_xlsx.py:1), [report endpoint](/home/han/projects/xray/xray-api/app/api/v1/endpoints/dir_studies.py:276), [current download handlers](/home/han/projects/xray/xray-web/app/projects/[id]/settings/DirWorkflowV3Panel.tsx:1563), [GIS action gate](/home/han/projects/xray/xray-web/app/projects/[id]/settings/DirReportActions.tsx:19), and [project export endpoints](/home/han/projects/xray/xray-api/app/api/v1/endpoints/projects.py:818).

## Intent and implementation differ

The six-stage plan maps Annex C to an audit of an already graded final GeoCUP. It preserves original geometry for Grade E and separates study proposals from uploaded grades. Its broader discussion of a missing independent baseline is not a new-study path in current setup. Its Stage 5 intent does not make missing source grades a hard compilation gate in current code.

The later Stage 2 plan establishes final-anchored comparison. Historical defect descriptions, customer identifiers, and counts in that plan describe an earlier investigation. They were not reproduced in the workspace or treated as evidence about this run. Saved older analyses retain their earlier method until reset.

Sources: [six-stage intent](/home/han/projects/xray/xray-api/docs/plans/2026-10-20-dir-six-stage-workflow.md:18), [Stage 2 change](/home/han/projects/xray/xray-api/docs/plans/2026-10-21-dir-stage2-geocup-anchor.md:1), and [current DIR spec](/home/han/projects/xray/xray-api/docs/specs/dir-automation.md:1).

## Scope of the local check

The local checks cover Marmerlade's saved project, rendered canvas folds, wiki pages, links and embed, deck and slides, native GIF, imported image, and Mermaid structure. The eight wiki pages cover overview, setup, geometry rules, investigation and grades, compilation and exports, blocks, intent and limits, and a focused geometry map. The five-slide deck agrees with those pages.

The original generic globe comes from [Xray's public globe asset](/home/han/projects/xray/xray-web/public/globe.svg:1). It is a geography symbol, not customer data, a project map, or an Xray logo. The project copy and embedded SVG match the original bytes. Kiro is explicitly an authoring/tool context outside the Xray processing path. The host has image_gen.imagegen. No image-generation call was needed.

No Xray screen flow, API transaction, database value, migration, generated customer workbook, or GDB conversion was run. Local source citation paths and line bounds were checked by verify-acceptance.mjs. Exact source hashes, citation lines, linked document IDs, and file checks are in verification-results.json.
