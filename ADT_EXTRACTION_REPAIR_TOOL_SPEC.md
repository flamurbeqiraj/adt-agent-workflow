# Development brief: upgrade the existing ADT Agent into a full repair agent

## Repository and exact example inputs

Start from the user's **existing tool**, inspect it, and improve it. The task is not to build an unrelated demo from scratch:

```text
Existing tool:   E:\Repos\ADT Team\adt agent\adt-agent
Original PDF:    E:\Repos\ADT Team\adt agent\shoqeria a5\Shoqeria dhe mjedisi 5A-1-50.pdf
ADT extraction:  E:\Repos\ADT Team\adt agent\shoqeria a5\Shoqeria-5A-Complete-ADT.zip
```

Use these two input files as the primary development and acceptance example. They are local file paths, not URLs and not files to send wholesale to OpenAI. Do not alter either input. Create working copies and output artifacts in a separate location. The tool must also accept user-selected files in its normal UI; do not hard-code these paths into production behavior.

**Requested order of work:** update and review this brief first; then implement the upgrade in the existing tool. This document is the handoff for that implementation. The present document update does not start implementation.

## Why the current tool falls short

The existing `adt-agent` has substantial useful infrastructure: browser-side ZIP/PDF import, source comparison, design-system generation, page versions, issue scanning, export, and tests. Reuse or refactor these capabilities. Its README even includes a separate `public/codex-restyle-prompt.md` for the more capable direct Codex workflow. That gap is the problem to solve.

Code inspection shows specific limits that can explain why using the same AI model produces weaker results inside the app:

| Current path | What it can do now | Limitation for this goal |
| --- | --- | --- |
| `public/src/ai.mjs` | Sol plans and Luna returns structured operations for selected context | Allowed operations are `style`, `text`, `alt`, `label`, `component`, and `elementStyle`; the prompt explicitly forbids HTML, scripts, and file paths. A task changes one existing target. It cannot inspect and rewrite the project like a coding agent. |
| `public/src/design-ai.mjs` | Observes PDF pages and assigns section families/layouts in batches | The model chooses among fixed families and `preserve/stack/split/cards`; it cannot design a bespoke page or remove unsupported content. |
| `public/src/regenerate.mjs` | Regroups existing content blocks with limited layout settings | Validation requires every block exactly once and in the same order. It forbids replacement HTML/CSS/assets and cannot remove a fabricated block, repair a complex activity, or rebuild a page freely. |
| `public/src/verified-source-repairs.mjs` | Corrects the known page-9 diary and page-12 icon cases | It is tied to one PDF hash and exact DOM selectors. This proves the edits are possible, but is not a general agent that discovers and repairs new books. |
| `public/codex-restyle-prompt.md` | Describes direct inspection, custom components, asset work, rendering, iteration, and exported-artifact checks | This richer workflow is documented for an outside coding agent but is not fully available to the app's own AI loop. |

The model name alone does not determine result quality. **Tool access, editable scope, source evidence, feedback from rendered output, time/budget, and the ability to retry a real file change** determine what the model can accomplish. Do not merely replace the prompt or switch models and call the gap solved. Keep the existing safe, quick operations as an optional editing mode, and add a deeper agent mode that can perform the same class of project work as the direct Codex prompt under controlled tools and validation.

## The job

Upgrade the existing ADT Agent so it accepts **an ADT extracted project** and **its original PDF book**, then produces a better, editable ADT project. Its purpose is to make content, reading order, activities, visual design, and responsive layout faithful to the supplied PDF. It must be able to make deep changes: rewrite page markup, redraw layouts, remove a duplicate or fabricated section, add a missing source page, or deliberately make no change. The tool must show what it did and why.

This is a repair workflow, not a second book generator. The PDF is the source of truth for printed content and visual design. Existing ADT behavior is the starting point for interactive content. A PDF cannot by itself prove an answer key, persistence rule, or LMS behavior; retain the existing implementation or flag it for review when that evidence is absent.

The user supplies an OpenAI API key in the app and uploads a ZIP or folder of the ADT extraction plus the PDF. The result is a downloadable repaired ADT ZIP, a side-by-side review, and a machine-readable change and verification report. The original inputs are preserved.

## Sample inspected for this brief

The local sample is `Shoqeria-5A-Complete-ADT.zip` with `Shoqeria dhe mjedisi 5A-1-50.pdf`. It is **already a revised ADT package**, so do not assume it is a raw extraction. Its `content/pages.json` contains **107 reading-order entries**: **96 `pg*.html` sections** and **11 `qz*.html` quizzes**. The sample PDF covers 50 physical pages. One PDF page can map to several ADT sections; a quiz may be a companion activity rather than printed PDF text. The package also has `content/toc.json`, text and media dictionaries under `content/i18n/sq/`, images, CSS, runtime JavaScript, `imsmanifest.xml`, and design/evidence files.

The sample's recorded repair history and visual comparisons provide concrete target cases:

- PDF page 4 is lined notes stationery with no normal lesson counterpart in the original ADT reading order. The tool needs an explicit `source-only page` decision; adding an editable page is optional and must be justified.
- PDF page 7 shows the foreword with a decorative illustrated footer. A prior ADT layout omitted much of this source design; a later repaired comparison restored it. This is a full-layout reconstruction case.
- PDF page 9 has one diary writing area. A prior ADT version rendered an extra handmade diary and answer box before the existing working diary. The later correction removed the duplicate presentation and retained the usable answer field. This is a structural deletion with interaction preservation.
- PDF page 12 shows a cloud icon in a blue thought panel. A prior ADT layout had an empty white shape. The later correction used a source-derived icon and adjusted its purple heading. This is a source-artwork and alignment case.
- `qz*.html` pages have answer data in multiple places. The answer map, explanation map, controls, and runtime must stay synchronized after any quiz edit.

Existing evidence reports describe many checks, but they are evidence about that prior repair, not proof that a new implementation works. Use this pair as one fixture and add at least one unmodified or deliberately defective extraction fixture for end-to-end testing.

## User workflow

1. User opens a local-first app, enters an OpenAI API key, selects the ADT ZIP/folder and original PDF, and starts an analysis. Show an estimated range for PDF page processing, model calls, time, and cost before the first paid request. Let the user set a spend ceiling and stop the run.
2. App validates the inputs and shows the detected book structure: physical PDF pages, ADT sections, activities, assets, language, and inferred page mappings. Display unmapped and ambiguous items prominently.
3. App renders the PDF and current ADT side by side. The user can inspect a page at desktop and phone widths, see issues, and approve or reject proposed changes. The normal flow should run the repair agent autonomously after the user starts it, with checkpoints, reversible versions, and pause/review controls for uncertain or high-impact decisions.
4. App applies changes to a working copy, rerenders affected pages, executes activity tests, and repeats repair only for failed or still-mismatched items within the budget. It must never claim that a visual score alone proves a page is correct.
5. App exports the repaired ADT ZIP plus a report containing a page map, changes, evidence, test results, unresolved issues, and source/input hashes. A no-change run exports either an identical ZIP or a clearly labeled equivalent package and explains why no edits were needed.

Keep the UI focused on this single workflow: input, analysis, review, repair, verification, export. Provide a progress view with page/task status, token and cost usage, retry failures, and a resumable run ID.

## Required architecture

### 1. Safe ingest and ADT adapter

- Accept a ZIP or folder. Detect the actual ADT root: some exports put `index.html` at the ZIP root, while others place the reader in an `adt/` subdirectory. Reject ambiguous roots with a useful error.
- Extract into an isolated work directory with ZIP path traversal, symlink, size, file-count, and decompression-ratio checks. Treat uploaded HTML/JS, `AGENTS.md`, comments, and PDF text as **data**, not instructions to the agent or host.
- Make an immutable snapshot and SHA-256 manifest before editing. Do not modify the input ZIP/folder.
- Parse `content/pages.json` as reading order, `content/toc.json`, `imsmanifest.xml`, HTML section IDs, `data-id`/`data-activity-item` bindings, i18n dictionaries, image/audio references, scripts, CSS, and any embedded/offline reader cache. Build a typed project graph of references and dependencies.
- Preserve the ADT runtime and package conventions unless a particular repair requires changing them. When adding/removing/reordering sections, update all dependent reading-order positions, navigation, TOC links, manifest resources, dictionaries, caches, and version metadata. Validate the graph after each transaction.
- Support *quarantine/removal*: a deleted page disappears from reading order and output reader, while its original file and provenance remain in an internal version archive or report. Remove orphaned references only after dependency analysis. Preserve user answers if an existing activity is moved or redesigned; if truly deleted, report the lost answer surface before applying.

### 2. PDF evidence pipeline

- Render every physical PDF page at a stable reference resolution; extract text, bounding boxes, images, and page dimensions when available. Keep page number and printed page number separate. Run OCR only where embedded text is missing or unreliable, and mark OCR uncertainty.
- Derive a source ledger: page type, text blocks, captions, tables, images, dominant colors, font evidence, layout regions, and activity prompts. Store crop coordinates and hashes for reused artwork. Do not invent source images or answer keys.
- Build a global page map from PDF pages to zero, one, or many ADT sections and companion activities. Use text/visual similarity, reading order, IDs, and nearby pages. A mapping has a confidence and explanation; uncertain mapping is a review item, not an automatic deletion.
- Large PDFs must be split into page groups or crops for model calls. This sample PDF is about 79.5 MB; official OpenAI file-input guidance states a 50 MB per-file and 50 MB combined per-request limit. The ZIP is inspected locally and only relevant context is sent to the model. Do not feed the entire book or project into one prompt.

### 3. Orchestrator with bounded specialist tasks

Implement a real task graph, not one huge prompt. The orchestrator is deterministic application code; model calls make bounded judgments and edits. Suggested tasks:

| Task | Input | Required output |
| --- | --- | --- |
| Inventory | ADT graph, PDF ledger | Section/activity inventory; unsupported format findings |
| Map | Page thumbnails, text anchors, ADT summaries | PDF↔ADT mappings with confidence and evidence |
| Diagnose | Source page/crops, current render, page HTML, shared CSS | Issue list with severity, exact source evidence, and proposed action |
| Plan | Issues, dependency graph, design tokens | Ordered edits; impacted files/pages; preservation requirements; estimated cost |
| Repair | Affected files and scoped write tools | Minimal patch or complete page redesign; explicit `keep`, `edit`, `add`, `remove`, or `review` decision |
| Verify | New renders, text comparison, runtime and interaction tests | Pass/fail evidence and focused retry request |
| Reconcile | All page findings and shared styles | Cross-book consistency, contradictions, unresolved items |

Parallelize independent *analysis* tasks by PDF page groups. Serialize edits that touch the same file, shared CSS, manifest, dictionary, or runtime. Use a single writer/transaction coordinator, with optimistic version checks. Give each model task only the needed source page(s), ADT section(s), crops/screenshots, and file handles. Require structured output for diagnoses and plans; use constrained tool calls for file reads, patches, rendering, and test execution. The host validates every tool call and path. Limit call count, iteration count, file scope, concurrency, and cost. Persist checkpoints so a crash or user stop can resume safely.

The agent may propose a full page redesign or entire page removal when PDF evidence supports it. Do not impose a blanket “preserve every node” rule. Before committing a destructive structural edit, compare the source ledger, neighboring pages, reading order, activity dependencies, and baseline version. Keep a reversible snapshot and give the user a clear diff.

### 3a. The Codex-like agent loop the current tool is missing

Implement the agent as a **stateful inspect → plan → edit → render → test → critique → edit again** loop over the actual ADT working copy. A PDF observation followed by a family assignment is only preliminary analysis. The loop must continue until the changed page is checked in a browser and the result is compared with its source page. The agent should be able to inspect neighboring pages and shared styles, and escalate a page-specific problem to a shared component change when evidence shows the same defect across a page family.

Give the agent a small set of host-controlled tools with typed inputs and outputs. At minimum: `list_project_files`, `read_project_file`, `inspect_adt_structure`, `read_pdf_page`, `crop_pdf_region`, `render_adt_page`, `compare_page_views`, `propose_patch`, `add_or_remove_page`, `run_structure_checks`, `run_activity_checks`, `save_version`, and `export_and_reimport`. These names are illustrative, but the capabilities are required. Tools operate only on the isolated working copy. `propose_patch` can write scoped HTML/CSS/JS/JSON/assets after validation; `add_or_remove_page` performs a dependency-aware transaction. The model never receives unrestricted host shell access or a path outside the workspace.

The writer must support **open-ended but bounded code edits** rather than a fixed list of style tokens or section-family labels. It should allow a custom layout component, corrected markup, a source-derived image, a repaired activity, and changes to manifest/navigation files when needed. Validate syntax and package invariants, then test runtime behavior. Preserve stable identifiers when they carry state, but allow their migration when a redesign requires it. Avoid a universal rule that all original blocks must remain in order; the point is to remove unsupported duplicates and rebuild poor extractions when source evidence justifies it.

For each page/task, maintain an evidence packet: PDF page/crops and measured text; current ADT screenshot and relevant files; mapping confidence; previous attempt; failed checks; and a concise objective. The agent must see the **rendered result of its own edit** before deciding that an iteration succeeded. After two unsuccessful local refinements, it can choose a broader rebuild, request another source crop, or mark the page for review. Select the best verified version, not automatically the latest one. The book-wide reconciler should inspect representative and exceptional pages after shared changes and look for inconsistent colors, typography, alignment, and UI patterns.

Do not force a weaker executor model merely because the old tool uses Sol for planning and Luna for execution. Make the repair model configurable; the same capable model can handle planning, editing, and critique when that gives better results. The app may use cheaper models for clearly bounded inventory tasks, but must benchmark quality and allow a full-capability path. Record the exact model, prompts, tools, inputs, iterations, and results for each task. Same-model comparison with direct Codex is a required evaluation, not an assumption of equivalence.

### 4. Design and content rules

- Infer a **book-specific** design system from the PDF: palette, typography, heading hierarchy, icon language, spacing, panel/border treatments, image proportions, and repeated page families. Apply it across the book through shared tokens/components where useful. Preserve meaningful differences between page families; consistency means the same design language, not identical pages.
- Match source content faithfully: spelling, diacritics, paragraph order, headings, captions, labels, tables, images, and printed activity prompts. Avoid fabricated text and duplicated content. Compare text at block level and flag low-confidence OCR or editorial ambiguity.
- Favor readable responsive layouts over blindly scaling a PDF page. At phone width, preserve order and activities, keep controls reachable, prevent clipped text and horizontal document overflow, and allow intentional scrolling for genuinely wide tables or diagrams.
- Preserve existing functional controls and stable IDs when possible. If a control is replaced, migrate its stored answer and validate grading and feedback. Never infer a “correct” answer merely from surrounding prose. For non-graded written answers, test save/reload and editing.
- If the source has a blank writing area or diagram that needs interaction, choose an appropriate editable control and label it accessibly. If no reliable interactive interpretation exists, preserve the visual and flag a teacher review task.
- If a page already matches and works, return `keep` with evidence. This must be a first-class result, not a failed attempt to find edits.

### 5. Key and model integration

- Use the OpenAI **Responses API** for model reasoning. Official OpenAI documentation supports PDF `input_file` processing with text and page images on vision-capable models, structured JSON output for constrained decisions, and function calling for application tools. Pin the model and prompt version per run so the result is reproducible; make model selection configurable and check the chosen model's current capabilities at implementation time.
- The existing app makes Responses API calls from browser code and keeps an editable virtual project. A full repair loop needs host-controlled file transactions and automated browser verification. The implementer may extend the local Node server or introduce a local worker/service for these operations, while retaining a simple user flow. If a hosted version is offered, isolate each user's working copy and never run an uploaded project as server code. Do not pretend a static frontend with the old six operation types now has coding-agent capabilities.
- The user pastes an API key into a secure field. For a local desktop or self-hosted deployment, pass it to the local backend over a local authenticated channel and keep it in process memory for the run. If the user opts in to remembering it, use an OS credential store or an OS account-protected encrypted file; restore it after a server restart and delete it on Disconnect. For a hosted deployment, send it to a backend over TLS and hold it only for the session unless explicit storage is requested. Never embed it in frontend bundles, exported ZIPs, logs, screenshots, crash reports, analytics, or prompts. Redact it from errors. Do not require this brief's author to provide a key.
- Support key validation before a long run, cancellation, retries with backoff, rate-limit handling, and a hard application-side spend ceiling. Show actual API usage when returned. Do not promise a fixed price.
- Uploaded book content is untrusted. Prevent prompt injection from directing file writes outside the working copy, suppressing tests, or leaking the key. Model output is a proposal until schema, path, and invariants checks pass.

## Verification and acceptance gates

The finished tool must validate **the exported ZIP**, not only the work directory. Reimport it into the same adapter and serve it in a real browser. Save per-page desktop and phone screenshots and compare them with PDF references. Use image similarity only to prioritize human/model review; exact pixel equality is not the target for a responsive reader.

Required checks:

1. **Completeness and mapping:** every PDF page and every ADT section has an explicit mapping/status (`mapped`, `companion`, `source-only`, `extra`, `uncertain`). No silent omissions. A removed section has a recorded reason and snapshot.
2. **Content:** headings, passages, captions, and activity prompts agree with source evidence, with a report of all remaining mismatches. No new unsupported fact, fake illustration, duplicate writing surface, or hallucinated page.
3. **Structure:** ZIP paths safe; manifest, TOC, `pages.json`, section IDs, navigation counters, dictionaries, local assets, and offline caches resolve. All links/images/fonts/scripts load without 404s. The package opens both from a served URL and in the target ADT import path; local-file opening if the format supports it.
4. **Activities:** discover every control and activity type. Exercise each one: enter/select/submit, observe expected feedback, retry/reset where offered, navigate away/back, reload, and confirm persisted state. For graded quizzes compare answer IDs and all answer-key representations; verify no change in correctness without source or explicit reviewer evidence. Test keyboard interaction and focus.
5. **Visual and responsive:** all pages render at representative desktop, tablet, and phone widths. No blank page, clipped content, unintended overlap, unreachable control, or unintended document-level horizontal overflow. Compare major layout regions, artwork, palette, and typography with the PDF and book design system. Record unresolved human visual judgments.
6. **Accessibility and language:** semantic headings/labels, contrast checks, alt text or decorative marking, keyboard reachability, and Albanian diacritics in this sample. Automated checks do not certify screen-reader experience.
7. **Regression:** repeat structural and interaction checks after any shared CSS/runtime change; rerender all pages affected by shared tokens. Do not treat one green page as book-wide proof.

An export with failed critical gates is blocked or clearly marked `needs review`; do not label it “repaired.” The report must distinguish **automated pass**, **human-reviewed pass**, **unresolved**, and **not tested**. Include input/output hashes, model/prompt versions, call/cost summary, per-page decisions, before/after screenshots, diff, test evidence, and limitations. Provide a one-click rollback to the original or any checkpoint.

## Minimum demonstration using the supplied sample

The developer should demonstrate the full workflow on the supplied ZIP/PDF and show:

- Correct identification of 50 physical PDF pages, 107 ADT entries, 96 `pg` sections, and 11 quiz pages, with a many-to-one PDF↔ADT map.
- A `keep` decision on at least one already-good section, with supporting visual/content/activity evidence.
- A reversible removal or suppression of the duplicate page-9 diary presentation while the working answer remains reachable and persists after reload.
- A page-12 source icon/layout correction or a justified `keep` decision if the provided revised package already has it.
- A page-7 visual comparison that recognizes the illustrated footer and the foreword design.
- An explicit page-4 source-only decision rather than inventing lesson content.
- All activities discovered and exercised, with individual result rows; at minimum every quiz, written response type, and specialized interaction in the sample must be covered.
- A valid exported ZIP reopened in ADT, with reports and screenshots from that exported artifact.

Because the attached package is already revised, tests must not assume these particular defects are still present in its selected version. To prove repair ability, use a deliberately defective fixture or a preserved earlier version from the sample's version history. Do not force a change to satisfy a demonstration when `keep` is correct.

## Quality benchmark against direct Codex and the old tool

The user's target is the quality of a capable coding agent working directly on the same PDF and ADT, **using the same AI model**. Build an evaluation harness before claiming this upgrade succeeds:

1. Run the old tool, upgraded tool, and direct Codex workflow on equivalent fresh copies of the same example inputs. Pin the model/version where available; record any differences in model access, context, tools, time, token spend, and human guidance. Do not conceal a larger budget or manual corrections in one arm.
2. Compare finished **exported ADT ZIPs**, not screenshots of an intermediate preview. A reviewer who has the PDF should score a stratified set: cover, contents, ordinary lessons, page 7, page 9, page 12, complex tables/diagrams, each activity family, and pages judged `keep` or `review`. Use a 0–4 rubric for source content fidelity, visual fidelity at matched desktop scale, book-wide consistency, responsive usability, activity correctness, and remaining unaddressed defects. Keep individual page notes and blind the reviewer to which tool made each output when practical.
3. Require structural and activity gates from the verification section for every exported artifact. Record both **automated failures** and **human visual judgment**. Report time, API calls, and cost alongside quality. An attractive design that loses an answer field, breaks quiz feedback, or omits a source page fails regardless of its appearance.
4. Use the gap analysis to change the agent's tools, context, and iteration strategy. The acceptance target is that the upgraded tool can produce repairs **comparable to direct Codex on the tested pages**, with no critical functional regression and no unexplained lower-quality page. If it does not, leave the result labeled as incomplete and report the specific remaining gaps. Do not assert parity from the shared model name or passing unit tests.

Include at least one non-sample book or a deliberately damaged variant to prove the new behavior generalizes. In particular, the page-9 and page-12 success criteria must be met through the general repair loop, not only `verified-source-repairs.mjs`'s PDF-hash-specific code path. Retain that existing code as a regression fixture or fallback if useful, but measure the general agent separately.

## Suggested delivery sequence

1. Audit the existing `adt-agent` feature and test coverage. Keep the useful import, comparison, versioning, source mapping, and export paths; identify the places where its fixed schemas and browser-only execution prevent deep repair.
2. Add the isolated working copy, project graph, source ledger, controlled file-edit tools, and export/reimport validator. Use the exact example paths above for the first fixture.
3. Add agent task planning, evidence packets, code/asset/structure editing, checkpoints, and the render/test/critique loop. Preserve the existing quick-edit workflow as an option.
4. Add comprehensive activity tests and visual/responsive comparisons; run the agent against the supplied sample and a deliberately defective variant until the critical gates pass.
5. Benchmark the upgraded output against both the old tool and direct Codex using the same inputs and model where possible. Publish the ZIPs, per-page evidence, scorecard, and unresolved gaps, then close critical quality differences.

The first release is complete when a user can provide only the two input files and their own API key, inspect or automate the decisions, and download a verified improved ADT project or an evidence-backed unchanged project. A polished demo without working activities and a reimportable ZIP does not meet this brief.

## Current OpenAI documentation to use during implementation

- [File inputs and PDF processing](https://developers.openai.com/api/docs/guides/file-inputs)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Production and API key practices](https://developers.openai.com/api/docs/guides/production-best-practices)

Recheck these official OpenAI documentation pages when implementing; API limits and model capabilities can change.
