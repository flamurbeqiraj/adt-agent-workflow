# ADT Studio

A local app for repairing an extracted ADT book against its original PDF.

## Start

Requires Node.js 22 or later. On Windows, double-click **Start ADT Studio.cmd**, or run the commands below.

```powershell
npm install
npm start
```

Open **http://127.0.0.1:8892**. The reader previews run on the separate local origin **http://127.0.0.1:8893**. Both servers bind to loopback.

Browser checks use Playwright Chromium, with installed Microsoft Edge as a fallback. If neither is available:

```powershell
npx playwright install chromium
```

## Workflow

1. **Your book** — upload an ADT ZIP/folder and its original PDF. The optional Shoqëria shortcut reads the paths in `example.local.json`.
2. **Analysis** — build a local PDF/ADT inventory, then connect an OpenAI key to compare the PDF with actual ADT browser renders. The app records mappings, companion activities, source-only pages, and uncertain evidence.
3. **Guidelines** — generate and edit the book's palette, fonts, layout, spacing, artwork and activity rules. Each save creates a guideline revision. The screen shows generating, stopped, and ready states. If a completed model response could not be saved, the app recovers it from its saved trace on startup without another model call.
4. **Repair pages** — choose sections and a budget. The same connected key works through analysis, guidelines, and repair. If the server restarts and the key was not remembered, connecting from this step starts the selected repair automatically. The agent reads files, inspects source images, crops artwork, writes HTML/CSS/JS/JSON, changes reading order, renders candidates, and runs checks. It can keep a good page or leave an unresolved candidate for review.
5. **Compare** — inspect the PDF, original ADT, and selected candidate together. The ADT previews are interactive. Choose saved page versions or regenerate with a new request. Native reader navigation keeps the comparison aligned.
6. **Export** — check desktop/tablet/phone views, activities, accessibility, and native navigation. Download an ADT ZIP with its originals, versions, guidelines, and report. Exports with incomplete checks are labeled `needs-review`.

The UI uses real task progress, saved checkpoints, short labels, illustrated help dialogs, and reduced-motion support. A connected key is needed for AI analysis, guideline generation and repair; local import, comparison, verification and export work without one.

### Universal repair blueprint

The repair agent now applies the [ADT repair blueprint](docs/ADT-REPAIR-BLUEPRINT.md) as binding book guidance. Its generated guidelines use a single centered reader shell with content-driven height, static Poppins 400/600/700, a 16 CSS px visible-text floor, balanced padding, meaningful page turns and disclosures, faithful source artwork, and activity classification. The agent can bundle the three licensed Poppins weights and their OFL license into a candidate, then update the book's CSS. The report checks font assets and Unicode coverage for visible reading text. The PDF still governs facts and artwork; answer keys remain source or ADT data, never guesses.

Whole-book verification records the five requested viewports (1280×800, 1366×768, 820×1180, 390×844, 320×568) plus landscape, 200% zoom, large text, reduced motion, touch activity probes, and expanded or filled states when applicable. Browser measurements include shell edges, padding, font size and family, clipping, horizontal overflow, default scroll, and image resolution. Each section receives a scorecard; width is compared across all sections at each default viewport. Longer pages and low-resolution images are reported for review rather than hidden or shrunk. The export report contains original and final inventories, a source-to-screen map, changed image ledger, per-page browser evidence, and explicit untested items. A ZIP with unresolved blueprint checks is labeled `needs-review`.

### Arrange New ADT pages

On **Compare**, select a page mapped to the PDF and choose **Arrange pages**. Select any New ADT page for that PDF page, move it up or down, add a blank page after it, or remove it from the reader. The reading order, page links, and table of contents update immediately. Removed pages remain in saved history. Select a new page and use **Repair this page** to generate its content from the PDF, then review the result and run whole-book checks before export.

## Agent execution

The server runs the OpenAI Responses API tool loop. The same selected model performs inspection, repair, and critique. Current choices are GPT-6.1 Sol and GPT-6 Astra. The model can make full file edits inside a candidate snapshot; it is not limited to the earlier tool's fixed layout recipes. No model tool can execute a host shell or read files outside the imported project.

Candidate edits are reference-checked and versioned before selection. The agent sees images of its own rendered changes. A separate same-model critique receives the PDF, before view, desktop/phone candidates, guidelines and browser evidence; it can require another edit or a review decision. Large files support exact text patches as well as complete replacements. Shared style/script changes trigger dependent page checks. Failed candidates stay in history while the previously selected book remains usable. Whole-project checkpoint restore is available when selecting an older page would conflict with later shared-file changes.

Run checkpoints, input fingerprints, and sanitized API/tool traces are saved. Images remain in the evidence folder; trace JSON omits image bytes and encrypted reasoning. Pause stops new model calls and the run resumes from completed page tasks. A partly completed page can be retried from the last selected project, with its candidates retained. Changing source or guideline revisions invalidates incompatible resumed runs. A server restart pauses an active job; an opted-in remembered key reconnects automatically.

Model prices are configured in `lib/openai.mjs` using the official documentation checked on 2026-11-03. A conservative allowance is checked before each request, and returned token usage updates the run cost. Recheck prices when changing models. Provider charges and timing can vary; the UI budget is an application guard, not an OpenAI account limit.

## Local data and isolation

- Projects and content-addressed file snapshots live in `.adt-workspace/projects/`.
- By default the pasted key exists only in server memory. On Windows, selecting **Remember on this computer** saves it in a Windows DPAPI protected file at `.adt-workspace/.openai-key.dpapi`; only the same Windows account can decrypt it. **Disconnect** deletes that file. The key is excluded from project files, browser storage, logs, screenshots, reports, and ZIPs.
- Imported code runs only in browser previews on the separate origin. Server API mutations require a session token and same-origin checks.
- Preview responses guard the known ADT SCORM adapter's parent-window lookup at the isolation boundary. Stored and exported scripts remain unchanged; the preview does not simulate an LMS.
- ZIP ingest rejects traversal, symlinks, duplicate paths, excessive expansion, ambiguous reader roots, and oversized archives.
- Original uploads remain unchanged. Every export is reopened and all runtime file hashes are compared with the revision that was checked.
- This is a local single-user app. Hosting it for multiple users requires separate authentication, credential isolation, storage boundaries, and a hardened browser worker.

## Verification

```powershell
npm test
npm run test:browser
```

The browser test uses **simulated OpenAI responses** with the real API transport interface, real tool execution, real PDF rendering, real file edits, browser checks, version previews, answer persistence, ZIP export and browser testing of the reimported ZIP. The transaction tests also cover additions, removals, rejected controls, visual critique failures and recovery. It does not prove live model quality. The tests never use a real API key or incur model charges.

After loading the Shoqëria sample into the running app:

```powershell
node tests/sample.mjs
node tests/full-book.mjs
node tests/smoke.mjs
```

This checks representative real source/ADT pages and saves comparison screenshots and results under `tests/artifacts/`. The full-book **Check the whole book** action runs every section. Reports distinguish automated passes, review items and untested behavior. Specialized activities without a supported probe remain for review; automated accessibility checks do not certify screen-reader or LMS behavior.

## Current implementation evidence and limits

The supplied 79.5 MB PDF imports locally and yields 50 source pages. Its unchanged baseline passed 321 viewport renders, 608 activity assertions, automated WCAG A/AA checks, and 223 reader navigation steps in this environment. Reports are saved under `tests/artifacts/full-book-*.json`; this baseline evidence does not establish AI repair quality. Its ADT yields 107 sections, including 11 companion quizzes. No whole PDF upload to OpenAI is required; model requests use relevant rendered pages and file context. The original tool's book-specific page-9/page-12 correction function is not used by the repair agent.

Live model quality and parity with a direct Codex session require a user-supplied key and a comparative run. No such claim is made by the automated tests. Scanned PDF pages with little extracted text are flagged; the visual agent can inspect their images, but the local pipeline does not include a separate OCR engine. Existing source-supplied grading is preserved; pedagogical correctness remains reviewable.

The original ADT adapter concepts, cache format, PDF evidence approach, and versioning requirements were carried forward from the earlier app at the path in the specification. Its fixed operation schemas were replaced by the server tool loop. The bundled Poppins fonts retain their OFL license in `public/fonts/`.

See [the implementation brief](ADT_EXTRACTION_REPAIR_TOOL_SPEC.md) for the source paths, intended behavior, and quality rubric. OpenAI implementation references: [function calling](https://developers.openai.com/api/docs/guides/function-calling), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), and [file inputs](https://developers.openai.com/api/docs/guides/file-inputs).
