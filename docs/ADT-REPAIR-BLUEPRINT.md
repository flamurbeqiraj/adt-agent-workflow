# Universal ADT repair specification

Give this document to the person or agent repairing an Accessible Digital Textbook (ADT). Supply the ADT bundle and, when available, its source PDF or page images. Apply the rules to the **entire book**, not only a sample page. Deliver a readable, inclusive, visually consistent, offline-capable book with working activities.

## 1. Required result

- Give every page the same centered reading width. Let height grow naturally, while using coherent page turns and accessible collapsible sections to keep ordinary scrolling short or unnecessary. A printed page may become several screen turns.
- Keep every source lesson, prompt, paragraph, image, caption, glossary item, and activity accounted for. Preserve the meaning and sequence of the teaching material.
- Use **one locally bundled static font family: Poppins**. Regular, SemiBold, and Bold are weights of the same family. Do not mix in serif, handwriting, variable, or system-specific text fonts.
- Keep all visible text **at least 16 CSS px**. This includes captions, instructions, labels, answer text, feedback, page counters, and buttons. Use larger sizes for normal reading and activities.
- Make every essential action work with mouse, touch, keyboard, and assistive technology. Activities should be simple, inviting, and genuinely interactive.
- Remove visual clutter and extraction artifacts: stray rectangles, unexplained empty boxes, uneven padding, duplicated headings, and shapes that cover or disconnect content. Make buttons, cards, and rounded shapes recognizably part of one book.
- Improve image clarity through faithful high-resolution extraction or careful upscaling when an asset is too small. Keep original subject matter and proportions.
- Preserve the ADT reader's navigation, localization, offline behavior, and any LMS packaging.

## 2. Source and decision rules

Use the original PDF or page images and the ADT's existing content as the authority for facts, wording, artwork, question order, and answers. Correct obvious extraction errors only after checking the source. Use the design rules below to establish consistent presentation. When the source and design conflict, keep the educational content and make the presentation accessible.

Do not invent missing chapters, explanations, quiz answers, historical details, or image content. Mark ambiguous questions for editorial or teacher review. A lower number of HTML sections or controls after repair is acceptable only when every original learning item has a documented, reachable equivalent.

## 3. Inventory before editing

Inspect the complete reading order, every HTML screen, the localization files, glossary, images, audio, quizzes, and the source pages. Create a section ledger with these columns:

| Field | Record |
|---|---|
| Reading order | Section ID, HTML filename, one-based navigation position, printed page number, table-of-contents link |
| Content | Headings, paragraphs, prompts, captions, glossary terms, stable text IDs, source page location |
| Images | Source image, natural dimensions, displayed dimensions, crop, alt text, decorative status |
| Activities | Prompt, control type, control ID/name, response key, expected behavior, feedback and grading source; classify as digital, physical/offline, discussion, or hybrid |
| Layout | Page family, page-shell width, left/right padding, related content blocks, likely split points for desktop and phone |
| Issues | Missing or duplicated content, blurry media, broken links, tiny text, overflow, content appearing on another screen, stray shapes, uneven padding, inaccessible controls, ambiguous answers |

Before and after editing, count the sections in the reading-order manifest, text IDs present in HTML, localization keys, activity controls, image references, quiz payloads, and audio mappings. Compare actual visible HTML with both the localization data and source pages. Retaining a string in a JSON file is insufficient if no screen displays it. Record every merge, split, replacement, or intentional removal in the ledger.

## 4. Fixed visual system

### Typography

Use static **Poppins Regular 400**, **Poppins SemiBold 600**, and **Poppins Bold 700** files stored inside the book. Use the same family for headings, body copy, captions, tables, form fields, quiz options, feedback, and reader controls. Confirm that the bundled files cover every character used by the book's language. If Poppins lacks required glyphs for a different language, choose one licensed static family with full coverage and use that family everywhere.

| Text role | Desktop starting size | Phone starting size | Weight |
|---|---:|---:|---:|
| Chapter or lesson title | 30–32 px | 24–28 px | 700 |
| Section or activity heading | 24–28 px | 22–24 px | 600–700 |
| Reading body | 20–22 px | 18–20 px | 400 |
| Question and answer choice | 20–22 px | 18–20 px | 400–600 |
| Caption, hint, label, feedback, counter | 16–18 px | 16–18 px | 400–600 |

Use a line height around 1.4–1.6, natural wrapping, and left alignment. Keep paragraph breaks. Avoid justified text, compressed letter spacing, `scaleX`, viewport-scaled type that falls below the floor, and font shrinking to make a page fit. If content is too tall, split or disclose an appropriate block. Keep focus outlines visible and tappable targets at least 44 × 44 CSS px where practical.

### Palette and roles

Use these values as a consistent starting system. Adjust any color that fails contrast while retaining its role.

| Role | Starting color | Typical use |
|---|---|---|
| Main ink | `#231F20` | Body text on white or light panels |
| Lesson purple | `#A15BB0` | Large title band and accents |
| Dark purple | `#794282` | Smaller white-on-purple labels and controls |
| Reflection cyan | `#99CED9` | Thought and reflection prompts |
| Discussion green | `#A1CF75` | Conversation and group tasks |
| Research yellow | `#FFF4CE` | Research and further-reading notes |
| Practice orange | `#FFAC2C` | Exercise rules, tabs, and page cues |
| Paper | `#FFFFFF` | Main reading and answer surface |

Keep normal text at a contrast ratio of at least 4.5:1; large text and essential UI boundaries should reach at least 3:1. Color must never be the only way to identify a task, answer, status, or feedback. Add clear wording and meaningful icons. Use one spacing scale, such as 4, 8, 12, 16, 24, and 32 px.

### Page width, padding, shapes, and cleanup

- Define **one shared page-shell width** for the whole reader. A useful starting token is a maximum width of `1000px` with equal outer gutters of `16–24px` on small screens. Every reader page, including covers, lessons, quizzes, and activities, uses `width: 100%` within that shell and is centered. Compare computed widths and left/right edges across every page at each viewport; a lesson must not become wider or narrower merely because it uses a different family. An intentionally narrower inner card may sit inside the same full-width page shell.
- Let page height be `auto` so text, images, opened disclosures, and student responses determine its height. Avoid fixed page heights and absolute positioning that let lower content escape the page. Use minimum height only when it does not create a blank screen or push content under the dock.
- Use **balanced horizontal padding**. Start with `padding-inline: 20px` on phones and `32–40px` on larger screens, then adjust by family through shared tokens. A text panel with right padding but `padding-left: 0` is a visual defect unless it is a deliberate, documented edge-to-edge element. Align paragraph text, headings, fields, and captions to the same inset. Recheck padding at every breakpoint.
- Use a small set of rounded shapes consistently: for example, `20px` radius on content cards, `12px` on fields and choice tiles, and pill-shaped primary buttons. Give each button type the same height, padding, border, text weight, hover, focus, pressed, and disabled states throughout the book. Keep the same shape for the same purpose.
- Inspect every visible rectangle, line, badge, shadow, and background. Each should frame content, identify a teaching role, or provide an interactive target. Remove isolated central rectangles, empty cards, accidental overlays, duplicated borders, and decorative boxes that make no sense in context. Check the source before removing a meaningful illustration. Do not cover text or controls with a shape.
- Use gentle motion to make page turns and feedback inviting: short transitions around `150–250ms`, no flashing, no essential information conveyed only by animation, and a still alternative under `prefers-reduced-motion`. Motion should help a child see what changed, not distract from reading.

### Component consistency

Create reusable components for title bands, keyword strips, reading blocks, image/caption pairs, reflection panels, discussion panels, research notes, practice steps, writing areas, quiz choices, and feedback. Apply the same component to the same teaching function across the book. Allow purposeful differences: a contents page, an illustrated opener, a worksheet, and a quiz should not all become identical cards. Scope the book styles so they do not unintentionally change the reader dock or third-party controls. Review page screenshots together as a sequence; shared widths, insets, button styles, corner radii, and visual rhythm should make them look like one book.

## 5. Layout families

Classify each screen by its teaching purpose. Use these family rules throughout the book:

| Family | Layout rule |
|---|---|
| Cover | Show title, level, authors, publisher, and main image as separate readable elements. |
| Contents | Group chapters clearly; align page labels; make available entries navigable. |
| Icon guide | Pair each icon with a short text explanation. |
| Chapter opener | Keep artwork and chapter title prominent without adding unneeded text. |
| Foreword or long reading | Preserve paragraph order; split at paragraph boundaries. |
| Lesson | Use a stable title, keywords, short reading blocks, and relevant figures. |
| Illustrated lesson | Keep each figure with the text and caption that explain it. |
| Reflection | Use a distinct cyan cue, short prompt, and optional response area. |
| Discussion | Use a distinct green cue; respect oral and group work. |
| Research or glossary | Use a light yellow or clearly outlined panel; keep term and definition together. |
| Practice worksheet | Use an orange cue; show one clear task or a small related group per turn. |
| Written response | Keep the full prompt and a labeled writing field on the same screen. |
| Comparison | Keep compared images and labels in a meaningful order; reflow them on phones. |
| Diagram or labeling | Preserve spatial relationships and provide a linear text alternative. |
| Self-assessment or rating | Use consistent choice controls and spoken value/status. |
| Quiz | Keep the complete question and choices together with clear feedback. |
| Word puzzle | Present a focused puzzle view, source word/clue list, progress, and accessible alternate entry. |
| Drawing | If it is a digital drawing task, provide usable creation, undo, and save routes plus a text or upload option. |
| Group or physical project | Keep steps, materials, roles, and expected outcome together; do not add unnecessary web controls. |

Do not turn each printed page into a single shrunken image. Keep live text editable/selectable, images separate, and controls operable.

## 6. Flexible height with minimal scrolling

The **reader screen** is the navigation unit; it need not match one physical printed page. Keep the page width fixed to the shared shell, but let its height respond to actual content. Aim for no ordinary document scrolling at normal zoom. Use a coherent next page or an accessible disclosure when content is long. Never force the page into a fixed height or hide overflow to make a screenshot appear to fit.

Follow this procedure for each source page:

1. Measure the usable viewport after fonts, images, and the reader dock have rendered. Reserve actual dock height and device safe-area space; do not guess one fixed footer height.
2. Divide content into meaningful groups: heading with introduction; paragraph with its image and caption; entire question with all options; prompt with response field; complete comparison pair; diagram with its labels.
3. Place a complete group on **exactly one** reader page. If it will not fit comfortably, move the whole group to the next page. Split long prose at paragraph boundaries. Split a table by rows with repeated headers. Never leave the beginning of a prompt on one page and its answer or explanation on another.
4. For long supporting text, use a clear disclosure such as “Read the full explanation” or “More about this topic”. Prefer native `<details><summary>` or an equivalent keyboard and screen-reader-operable control with a visible expanded state. Keep a useful short summary visible. Do not use a collapsed box to conceal missing or required material without a clear invitation to open it. Preserve its open state when the reader returns where practical.
5. If opening a disclosure makes the page taller than the viewport, let all of its content remain visible and reachable. If the expanded block itself is unwieldy, divide it into named subtopics or a dedicated continuation page. Do not clip it or let it overlap the dock.
6. Show a brief continuation cue and visible progress, for example “Printed page 23 · part 2 of 3”. Use an accessible heading that announces the same context. Keep repeated cues short so they do not consume the screen.
7. If a single activity is too large, give it a dedicated focused page or a responsive equivalent. A phone word puzzle can offer one-clue-at-a-time text entry while a wider screen shows the full grid; both routes should share the same progress.
8. Update the reading-order manifest, section identities, one-based position metadata, table of contents, internal links, offline cache, and LMS resource list after every split or merge. Keep the printed page number associated with all its parts. Retest Next/Back and direct entry.

**No content may leak between pages.** The last content block of the current page must belong to and render inside that page's section. The next page begins with its own intended content. Do not rely on CSS overflow, absolute positioning, delayed script insertion, or a stale offline cache to make a block appear on a later page. After the initial load and after every in-place page turn, compare visible text IDs and activity controls with the section ledger; inspect the bottom of the current page and top of the next page. Repeat after images load and after opening disclosures. No block may disappear, duplicate, or reappear under a different page heading.

Never use `overflow:hidden`, a tiny font, a scaled full-page canvas, or clipped text to simulate a no-scroll result. At 200% zoom, large text settings, very short viewports, expanded disclosures, or unusually long student answers, **allow reachable vertical overflow** rather than losing content. Avoid horizontal document scrolling; a complex grid may need a clearly labeled local pan/zoom view **plus** a fully usable linear alternative.

## 7. Images: clear, faithful, and described

1. Check each source asset's pixel dimensions against its largest intended display. Aim for at least two source pixels per CSS pixel. Keep small icons at a size they can support.
2. Prefer extracting the original high-resolution image or vector from the source. When that is unavailable, upscale the same asset conservatively and inspect it at final size. Remove noise and sharpen carefully. Do not invent lettering, people, landmarks, symbols, map features, or historical details.
3. Preserve aspect ratio. Use contain behavior for diagrams and full illustrations. Crop photos only when the crop preserves the subject and matches the educational intent. Keep image labels and captions as live text whenever possible.
4. Use an appropriate local format: SVG or PNG for line art and transparency, and an efficient format for photos. Verify offline loading and reasonable file size.
5. Give informative images short contextual alt text. Mark decorative images with empty alt text. Explain complex diagrams and comparisons in nearby text. Avoid repeating a caption word for word.
6. Record each replacement's source, original/output dimensions, processing, new filename, alt text, and visual review result in an asset ledger.

## 8. Activities: easy, fun, and fully working

Classify each source task **before** adding controls:

- **Digital:** a child can complete it in the browser. Make the complete interaction work, including input, feedback, saved state, keyboard access, and reset/undo where applicable.
- **Physical/offline:** the task requires paper, scissors, glue, a real-world observation, or another action outside the browser. Present clear instructions, materials, and any helpful image. **Do not add a fake Submit, Done, score, or required in-book action.** For example, “Cut a paper shape and place it on your desk” remains an instruction to perform with paper.
- **Discussion/group:** the meaningful action is speaking, collaborating, or presenting. Keep the instructions readable; optional notes may help, but do not require a web response or pretend to grade the conversation.
- **Hybrid:** provide a useful optional web companion only when it supports the real task. Make the physical and digital routes explicit and equivalent where possible.

Use short age-appropriate instructions, an obvious first action, visible progress, encouraging and informative feedback, and an undo or reset route where appropriate. Do not add timers by default. Preserve the source learning objective. Decoration without functioning controls is not an activity.

| Activity | Required behavior | Inclusive route |
|---|---|---|
| Multiple-choice quiz | Select, receive text explanation, retry or continue; preserve original key and scoring. | Native radio choices or equivalent keyboard-operable group; visible focus; feedback announced politely. |
| Writing or notebook | Type, edit, return later, see saved answer. | Prompt-associated label, readable field, sufficient height, no image-only writing lines. |
| Rating or self-assessment | Choose a value per item and see the selected state. | Radio group or buttons with spoken value; row/column meaning in accessible names. |
| Diagram, Venn, labeling | Enter answers for every meaningful region. | Linear form with the same stored answers; no drag-only route. |
| Word search | Select letters/words, show found count, clear selection, reset progress. | Arrow-key grid with announced row/column and an alternate text-entry route. |
| Crossword | Enter clues, navigate cells, show supported progress. | Whole-word fields labeled by clue; handle language-specific multi-letter graphemes. |
| Drawing | Draw, undo, clear, return to saved work. | Upload or written-description option for students who cannot draw with a pointer. |
| Discussion or group project | Show steps, roles, and deliverable without losing context. | Optional notes/checklist; no forced automated grade for an oral or group task. |
| Physical craft or observation | Show materials and numbered real-world steps; no web completion control. | Explain steps in plain text and describe any instructional image. |

Keep correct-answer and explanation data synchronized wherever the ADT duplicates them in HTML attributes, JSON blocks, scripts, and localized text. Never guess an answer key. For open responses, use self-check prompts or teacher review instead of pretending to grade free text.

Save non-quiz responses locally under a namespace that includes the book, section, activity, and version. Restore on direct load, Next/Back, in-place page turns, browser Back/Forward, and reload. If an activity appears in a short view and a focused view, both must use the same answer state. Prevent unrelated fields from sharing a key. For quizzes, either restore the full graded state **with feedback** or start clean; never show a selected option without its explanation. Provide a clear “clear my answers” action with confirmation on shared devices. If storage is unavailable, the activity must still work for the current visit.

### Activity reality check

Test **every digital activity**, including those that look correct in screenshots. Follow the exact child-facing instructions and confirm that each step can be completed. Test an initial attempt, an incorrect or incomplete attempt where relevant, correction/retry, reset/undo, navigation away and back, reload, keyboard-only use, touch use, and offline use. Confirm that feedback refers to the question actually shown. Check that controls, answer fields, and labels belong to the current page and are not duplicated on the next one. Record a failing activity by page and repair it before calling the book finished. Physical and discussion tasks pass when their instructions are complete, readable, and do not demand a false web action.

## 9. Text, localization, audio, and package integrity

- Preserve stable text IDs whenever possible. Keep visible HTML, display-text dictionaries, speech-text dictionaries, and inline fallback text aligned. A changed string may need a new recording; text and audio must not disagree.
- Set the document language correctly. Verify all characters, punctuation, and language-specific reading order. Keep glossary words, definitions, and matching forms synchronized.
- Enable read-aloud only if its local audio mapping is complete and files play offline. Provide pause/replay controls and a text equivalent. Do not silently enable a feature with empty mappings.
- Keep the existing reader runtime, navigation hooks, grading data, and vendored libraries stable. Add book-specific behavior in separate scoped source files. Rebuild generated CSS from its editable source rather than editing a compiled file by hand.
- If the reader swaps HTML in place, initialize each activity when its screen appears and avoid duplicate event listeners. Restore saved state after the swap.
- Synchronize any embedded offline copies of HTML, localization, and CSS after changes. Update the dependency version or cache key as required. Check that the exported book opens without network access.
- Update the LMS/SCORM resource manifest when screens or assets change, and verify behavior in the target LMS separately from local browser testing.

## 10. Whole-book verification and acceptance

The last step is a **complete sequential check of the finished book**, not a spot check of examples. Open every final page in reading order and inspect it beside neighboring pages. At minimum check these viewport sizes at normal zoom: desktop 1280 × 800, laptop 1366 × 768, tablet 820 × 1180, phone 390 × 844, and small phone 320 × 568. Also check landscape, 200% zoom, large text, reduced motion, opened disclosures, and filled answer states.

| Check | Pass condition |
|---|---|
| Completeness | Every source learning item is present or has a documented equivalent; all changed IDs and controls are reconciled. |
| Page width and padding | Every reader page uses the same centered page-shell width and left/right edges at a given viewport, within a small measurement tolerance such as 2 CSS px. Text panels have balanced insets; exceptions are intentional and documented. |
| Height and content amount | Height follows content. Ordinary scrolling is removed where practical by sensible page turns or disclosures. No page is inexplicably empty or overloaded; intentional taller pages are recorded and remain easy to navigate. |
| Content ownership | The complete final block remains on its intended page. No text, image, control, or feedback disappears at the bottom, shows under the next page's heading, duplicates, or covers the dock. Check on direct load and after Next/Back. |
| Typography and color | All visible text is at least 16 px; Poppins is used consistently; line spacing is readable; text and UI contrast meet the stated targets. |
| Shapes and buttons | Cards, fields, buttons, borders, corner radii, and color roles are consistent across the book. No stray rectangle, unexplained empty panel, awkward zero-left-padding text, or accidental overlay remains. |
| Navigation | Every Next/Back turn, contents jump, direct link, reload, and browser history transition works; progress and printed page labels are correct. |
| Activities | Every digital activity works and makes sense for its prompt by keyboard, touch, and mouse; state and feedback behave as promised. Physical/offline activities show instructions without fake web controls. |
| Accessibility | Logical headings/focus order, visible focus, labels, alt text, non-color feedback, reduced-motion support, meaningful announcements, and routes that work for children with visual, hearing, motor, and cognitive disabilities. |
| Images | No broken local image, unwanted crop, blur at intended size, missing caption, or misleading description. |
| Localization/audio | All visible text IDs resolve; fallback text agrees; glossary works; every enabled audio file is present and playable. |
| Offline/LMS | Exported book opens offline; all assets and digital activities work; LMS package has current resources and is checked in its actual environment. |

Automated checks should measure the page shell's computed width and left/right edges, horizontal paddings, document `scrollWidth` and `scrollHeight`, component bounds, fixed-control overlap, computed font family and size, broken images, and console errors after rendering. Flag every page whose width differs from the shared shell, whose collapsed default state scrolls, or whose expanded state loses content. A reachable page bottom alone does not prove the layout is good. Use screenshots to inspect the visual sequence for consistent shapes, spacing, color, image clarity, and content density. Run an automated accessibility scan and a human keyboard and screen-reader walkthrough. Record pedagogical and LMS checks separately; neither is proven by a visual screenshot.

For each page, record a short pass/fail scorecard covering **width, height/scroll, padding, font, contrast, shapes, image quality, content ownership, navigation, activity behavior, and accessibility**. Repair all failures, then repeat the complete pass on the current final files. A book is finished only after this whole-book review and every digital activity test passes or an unresolved issue is explicitly reported.

## 11. Required deliverables

Deliver the repaired book and a current report with:

1. Original and final counts for screens, text IDs, controls, images, quizzes, and audio mappings.
2. A source-to-final screen map showing every split, merge, and preserved learning item.
3. The asset ledger for every improved or replaced image.
4. Screenshots or contact sheets at the tested viewports, the per-page visual scorecard, and navigation and activity test results.
5. An activity classification showing which tasks are digital, physical/offline, discussion, or hybrid, and evidence that every digital task works.
6. Offline/export and LMS results, with any untested environment named clearly.
7. An issue list for unresolved content or grading ambiguities that require editorial or teacher review.

Report results from the **current final files**. Do not reuse old pass counts after a later change.

## 12. Copy-ready task instruction

> Repair the supplied ADT using this specification. Inventory every page, localized text ID, image, audio file, quiz, and activity before editing. Use one locally bundled static Poppins family throughout and keep every visible text size at or above 16 CSS px. Give every page the same centered width, balanced horizontal padding, consistent rounded cards and buttons, and a flexible height. Remove stray rectangles, empty boxes, accidental overlays, and other visual nonsense. Reduce ordinary scrolling with coherent page turns and accessible collapsible sections; never clip content or let the bottom of one page appear on the next. Preserve all source learning items and correct-answer data. Classify tasks as digital, physical/offline, discussion, or hybrid: make every digital activity work, and give physical tasks clear instructions without fake web actions. Add gentle, reduced-motion-friendly animation and accessible keyboard, touch, screen-reader, feedback, and saved-state behavior. Improve low-resolution images faithfully. Update reading order, metadata, table of contents, localization, offline cache, and LMS resources after structural changes. Finish with a full page-by-page audit of width, padding, font size, content amount, contrast, shapes, image clarity, content ownership, navigation, and activity behavior at the required sizes, zoom levels, and offline. Deliver the repaired book, a source-to-screen map, an image ledger, per-page results, and an evidence-based report. Flag ambiguous source material rather than inventing answers.
