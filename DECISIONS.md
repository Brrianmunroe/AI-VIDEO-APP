# Decision Log (Case Study)

This file captures **case-study-worthy** decisions: major scope cuts, platform bets, and technical choices with tradeoffs.

---

## Decision: OpenAI mini for LLM-generated selects (cloud API, extensible)
- **Date:** 2026-02-18
- **Context:** Users want the AI to analyze transcripts and propose per-clip highlights (selects) based on a context brief, then review and export to Premiere.
- **Options considered:**
  - A) Local model (Llama/Ollama): no API cost, no data leaves machine; weaker JSON adherence and setup complexity.
  - B) OpenAI mini (cloud): strong instruction-following, cheap per token; transcripts sent to API.
  - C) Anthropic Claude: similar to B; add later as second provider.
- **Decision:** **Option B** — Start with OpenAI mini (`gpt-4o-mini` or `OPENAI_MODEL_ID` from `.env.local`); design `llmClient` and `aiService` as provider-agnostic so Anthropic/local can be added later.
- **Why (tradeoffs):**
  - Pros: best quality/cost for structured JSON output; simple setup (API key in `.env.local`); paid API data not used for training.
  - Cons: transcripts sent to cloud; requires API key and budget limit in OpenAI dashboard.
- **Impact on MVP:** llmClient loads `.env.local`, calls OpenAI chat completions; aiService orchestrates transcription → build payload → parse highlights → update `media.highlights`; IPC `ai:generateSelects`; GenerateSelectsModal adds story/style/userInstructions/desiredDuration; loading screen driven by real IPC promise.
- **Follow-ups:** Add provider selector and Anthropic/local support when needed; optional token-usage display in UI.

---

## Decision: Premiere export via FCP XML + media package (no relinking)
- **Date:** 2026-02-17
- **Context:** Users want to export the timeline for Adobe Premiere Pro and open it with no relinking—a single package they can move or share.
- **Options considered:**
  - A) EDL (CMX3600): one file; user imports in Premiere then links each reel to source files.
  - B) Generate .prproj ourselves: double-click to open; format undocumented and fragile.
  - C) FCP 7 XML + media package: user chooses folder; app copies used media into Media/ and writes Timeline.xml; user does File → Import in Premiere on the XML; media paths point to the package so no relinking.
- **Decision:** **Option C** — FCP XML + media package.
- **Why (tradeoffs):**
  - Pros: minimal user step (import one XML); no script to run; documented format; media in one folder so package is portable.
  - Cons: Premiere’s FCP XML import behavior may vary; we use absolute paths in pathurl so moving the folder may require one relink to the new Media folder.
- **Impact on MVP:** exportService.exportFCPXMLPackage (folder picker, copy media, build FCP 7–style xmeml, write README); IPC export:exportFCPXMLPackage and export:openFolder; TimelineReview calls it for Premiere and shows success banner with “Open folder.”
- **Follow-ups:** Validate Premiere import with real projects; consider relative pathurl if Premiere resolves relative to XML location.

---

## Decision: Editable review timeline (trim, extend, split, delete, ripple)
- **Date:** 2026-02-13
- **Context:** Users want to fine-tune the master timeline before export (e.g. add a sentence to the end of a clip, split a segment, remove a segment) like in Premiere or Final Cut.
- **Options considered:**
  - A) Read-only review timeline; all edits only on Interview Selects
  - B) Editable segments on the review timeline with trim handles, split at playhead, delete, and ripple
- **Decision:** **Option B** — Timeline Review holds segments in state; users can trim/extend (drag segment handles), split at playhead, delete a segment; all edits trigger ripple (recompute startFrame for following segments). Export uses the current edited segment list.
- **Why (tradeoffs):**
  - Pros: matches user expectation from NLEs; no round-trip to Interview Selects for small tweaks.
  - Cons: more UI and state (segment handles, selection, split/delete actions).
- **Impact on MVP:** TimelineReview owns mutable segments; applyRipple() helper; PlaybackModule gains editableTimeline, onSegmentTrim, onSplitAtPlayhead, selectedSegmentId, onSelectSegment; sequence playback shows segment under playhead.
- **Follow-ups:** None.

---

## Decision: Warning for accepted clips with no highlights
- **Date:** 2026-02-13
- **Context:** If a user accepts a clip but never added any highlights, the master timeline would omit it (highlights-only). We need to avoid confusion and give a path to fix.
- **Options considered:**
  - A) Allow proceed; show empty timeline or skip silently
  - B) Block proceed and show a warning with options: Delete the clip or Review (focus clip to add highlights)
- **Decision:** **Option B** — Proceed to review timeline is blocked when any accepted clip has zero highlights; a modal lists those clips and offers "Delete" (mark deleted) or "Review clip" (focus that clip so user can add highlights).
- **Why (tradeoffs):**
  - Pros: clear feedback; user can fix without losing context.
  - Cons: one more modal and flow.
- **Impact on MVP:** Timeline.jsx computes acceptedClipsWithNoHighlights; modal with Delete/Review per clip; proceed only when all accepted have at least one highlight.
- **Follow-ups:** None.

---

## Decision: Highlights persisted in DB
- **Date:** 2026-02-13
- **Context:** Highlight ranges (in/out per clip) were only in React state; refreshing or leaving the Interview Selects page would lose edits.
- **Options considered:**
  - A) Keep highlights in memory only
  - B) Store highlights per media in the database (e.g. JSON column)
- **Decision:** **Option B** — Add `media.highlights` (TEXT/JSON) column; load in getMediaByProject; save on highlight change (debounced) and on accept.
- **Why (tradeoffs):**
  - Pros: trims survive refresh; correct data when proceeding to review timeline.
  - Cons: schema migration and IPC for updateHighlights.
- **Impact on MVP:** media.highlights column and migration; mediaService.updateMediaHighlights; Timeline.jsx calls updateHighlights on change (debounced) and on accept.
- **Follow-ups:** None.

---

## Decision: Highlights-only on master timeline (no full-clip fallback)
- **Date:** 2026-02-13
- **Context:** When building the master timeline from accepted clips, we had to decide what to do with accepted clips that had no highlights.
- **Options considered:**
  - A) Use the full clip (0 to duration) when a clip has no highlights
  - B) Omit clips with no highlights from the timeline entirely
- **Decision:** **Option B** — If it's not highlighted, it's not important; only highlighted portions appear on the master timeline. Clips with zero highlights are skipped in buildTimelineFromAccepted.
- **Why (tradeoffs):**
  - Pros: clear rule; avoids accidentally including unselected content.
  - Cons: user must add at least one highlight per accepted clip (handled by no-highlights warning).
- **Impact on MVP:** buildTimelineFromAccepted only iterates over highlights; no full-clip branch.
- **Follow-ups:** None.

---

## Decision: Per-clip highlight ranges (many per clip) with transcript and timeline in sync
- **Date:** 2026-02-12
- **Context:** Users need to mark “the best bits” inside each clip for the story. Those ranges should be visible in the transcript and on the timeline, editable (e.g. drag handles), and passed to the review timeline.
- **Options considered:**
  - A) One in/out per clip (single range)
  - B) Many highlight ranges per clip with stable ids; transcript and timeline share one source of truth
- **Decision:** **Option B** — Each select has `highlights: Array<{ id, in, out }>` (seconds). Transcript shows highlighted spans (white ~50% background), ordinal pills (1, 2, 3), and draggable in/out handles that snap to word boundaries. Timeline shows the same regions and ordinals. Review timeline builds one segment per highlight (or whole clip if no highlights).
- **Why (tradeoffs):**
  - Pros: one clip can contribute several segments to the edit; clear identity via `id` for reorder/delete later; transcript and timeline stay in sync from single state in Timeline.jsx.
  - Cons: more UI (handles, ordinals) and logic (word-overlap, snap-to-word drag).
- **Impact on MVP:** Timeline holds `highlights` on each select and `updateSelectHighlights`; TranscriptPanel and PlaybackModule receive highlights/highlightRanges and render regions + ordinals; buildTimelineFromAccepted emits one segment per highlight; stub pre-fill gives one default highlight per clip when AI does not.
- **Follow-ups:** Add design token for highlight selection background (e.g. `--color-highlight-selection-bg`) if standardizing; optional keyboard nudge for handles.

---

## Decision: Optional word-level transcript timestamps for read-along sync
- **Date:** 2026-02-11
- **Context:** Transcript read-along highlight was driven by estimated word times (segment duration split evenly). Users reported timing feeling off; true word-level timestamps provide the best sync.
- **Options considered:**
  - A) User-adjustable offset (quick fix; no pipeline change)
  - B) Keep estimation, refine (e.g. character-proportional)
  - C) Real word-level timestamps from alignment (Python/faster-whisper or WhisperX)
- **Decision:** **Option C** — Optional word-level pipeline when Python + faster-whisper are available; fallback to existing Whisper (segment-level) otherwise.
- **Why (tradeoffs):**
  - Pros: best UX (highlight matches speech); no user tuning; backward compatible (existing DB rows and no-Python setups unchanged).
  - Cons: optional dependency (Python, pip install faster-whisper); extra code path in transcription service and frontend line-building.
- **Impact on MVP:** scripts/transcribe_words.py (WAV in, JSON words out); runForMedia tries it first, then Whisper; frontend buildTranscriptLines() groups word-level data into lines with .words; TranscriptPanel uses line.words when present for highlight.
- **Follow-ups:** Document in docs/SETUP_TRANSCRIPTION.md (optional section 4). Re-transcribing existing media with Python installed will produce word-level data.

---

## Decision: Single-clip playback on Timeline (Interview Selects) screen
- **Date:** 2026-02-11
- **Context:** Need transcript, playback, and timeline to work in unison like a video editor. Need to decide scope: one clip at a time vs full sequence on the Timeline screen.
- **Options considered:**
  - A) Single clip: user selects one clip from Interview Selects; show that clip’s video, transcript, and timeline only
  - B) Sequence: show a sequence of all (or accepted) clips; playback and transcript follow the sequence
- **Decision:** **Option A** — Single-clip playback on the Timeline screen.
- **Why (tradeoffs):**
  - Pros: simpler implementation; clear mental model (select clip → review that clip); transcript and duration map 1:1 to the one source; Timeline Review screen remains the place for sequence/export.
  - Cons: user must select a clip to see playback/transcript; sequence playback deferred to Timeline Review.
- **Impact on MVP:** Timeline screen holds currentTimeSec, isPlaying, and selected clip; loads transcript and video URL for selected clip only; PlaybackModule and TranscriptPanel are controlled by that state.
- **Follow-ups:** None.

---

## Decision: Custom media protocol (media://) for video playback URL
- **Date:** 2026-02-11
- **Context:** Renderer needs a playable URL for the selected clip. File paths are in main process; we could expose path via IPC or serve via custom protocol.
- **Options considered:**
  - A) Custom protocol (e.g. media://local/{mediaId}) that streams the file from main with Range support for seeking
  - B) IPC media:getPlaybackPath returning file path; renderer uses file:// (Electron can allow for known paths)
- **Decision:** **Option A** — Custom protocol media://local/{mediaId}.
- **Why (tradeoffs):**
  - Pros: same behavior in dev and prod; no raw paths in renderer; supports Range requests so HTML5 video seeking works; consistent with existing thumbnail:// pattern.
  - Cons: more main-process code (streaming, Range handling); slightly more complexity than file path.
- **Impact on MVP:** protocol.registerSchemesAsPrivileged for 'media'; protocol.handle('media', …) in main streams file from mediaService.getFilePathForPlayback(mediaId) with Content-Type and Accept-Ranges; Timeline passes videoUrl = `media://local/${selectedSelectId}` to PlaybackModule.
- **Follow-ups:** None.

---

## Decision: Video thumbnails via FFmpeg frame extraction
- **Date:** 2026-02-08
- **Context:** Need a thumbnail image per video clip for MediaCard (and future MediaFileCard) so users can identify clips at a glance.
- **Options considered:**
  - A) Extract a single frame with FFmpeg at ingest (same toolchain as ffprobe)
  - B) Browser/Electron video element to capture frame (renderer-only; heavier, less reliable for all codecs)
  - C) No thumbnails (placeholder only)
- **Decision:** **Option A** — FFmpeg frame extraction at add, stored under userData, path in DB, file URL to renderer.
- **Why (tradeoffs):**
  - Pros: one frame from inside the clip (e.g. 1s offset); reuses ffmpeg discovery pattern; thumbnails persist in userData; renderer gets file:// URL with no protocol changes.
  - Cons: requires FFmpeg installed (graceful fallback like duration); slight delay on add for video files.
- **Impact on MVP:** media.thumbnail_path column; thumbnails in userData/thumbnails; getMediaByProject returns thumbnail as file URL; MediaCard shows frame when available.
- **Follow-ups:** Optional refreshThumbnailsForProject for existing media; custom protocol if file:// blocked in dev.

---

## Decision: Figma MCP inspect + manual build for component implementation
- **Date:** 2026-02-06
- **Context:** Need to translate Figma component designs into React code. Three approaches considered.
- **Options considered:**
  - A) Auto-generate code from Figma (Figma-to-code tools)
  - B) Use Figma MCP to inspect designs, then manually build React components
  - C) Manually eyeball designs and rebuild from scratch
- **Decision:** **Option B** — Figma MCP inspect + manual build.
- **Why (tradeoffs):**
  - Pros: production-quality React code; uses our existing design tokens (tokens.css); proper component architecture with props/states; fits our Electron + React patterns; accurate to Figma via variable inspection.
  - Cons: more time per component than auto-generation; requires building SVG icons manually (can refine later).
- **Impact on MVP:** 8 components built in dependency order: Icon, Button, TextInput, DropDown, NavBarButton, MediaCard, NavigationBar (Sidebar), HighlightContainer. All use semantic design tokens. ExampleButton replaced.
- **Follow-ups:** Export exact SVG icons from Figma to replace inline approximations; integrate components into screens; add unit tests.

---

## Decision: Desktop-first (local processing) instead of a web app
- **Date:** 2026-02-04
- **Context:** Footage is large and often professional codecs; budget is near-zero; we want minimal infrastructure and cost.
- **Options considered:**
  - Web app (browser-based)
  - Desktop app (local-first)
- **Decision:** Build a **desktop app** first.
- **Why (tradeoffs):**
  - Pros: handles large local media better; avoids cloud storage/transcoding costs; easier access to filesystem + background processing.
  - Cons: packaging/distribution complexity; OS-specific quirks.
- **Impact on MVP:** Architecture assumes local files + local processing pipeline (e.g., proxies, transcription).
- **Follow-ups:** None.

---

## Decision: Focus MVP on interview selects only (de-scope B-roll)
- **Date:** 2026-02-04
- **Context:** Users can more easily self-serve B-roll scanning; interview review is more tedious and benefits more from AI assistance.
- **Options considered:**
  - Interview selects + B-roll selects in MVP
  - Interview selects only (MVP), add B-roll later
- **Decision:** **Interview selects only** for MVP.
- **Why (tradeoffs):**
  - Pros: simpler product, faster build, clearer value; reduces model/UX complexity.
  - Cons: less "end-to-end" feeling initially; B-roll assistance deferred.
- **Impact on MVP:** All ingestion, UI, and AI workflows focus on interview media and transcript-based selects.
- **Follow-ups:** None.

---

## Decision: Target Premiere Pro users first
- **Date:** 2026-02-04
- **Context:** ~90% of the intended network/user base uses Premiere Pro.
- **Options considered:**
  - Resolve-first export
  - Final Cut-first export
  - Premiere-first export
- **Decision:** **Premiere Pro first**.
- **Why (tradeoffs):**
  - Pros: matches user base; improves relevance of the MVP.
  - Cons: interchange formats can be trickier depending on exact export approach; may require iteration to get reliable import.
- **Impact on MVP:** "Definition of done" includes exporting a timeline that imports cleanly into Premiere.
- **Follow-ups:** None.

---

## Decision: Export MVP timeline to Premiere via EDL (CMX3600)
- **Date:** 2026-02-04
- **Context:** MVP needs a simple, reliable way to get approved interview selects into Premiere without graphics/effects.
- **Options considered:**
  - EDL (CMX3600) for a simple sequence
  - XML/other richer interchange (more complex, higher risk)
- **Decision:** Use **EDL (CMX3600)** export for MVP.
- **Why (tradeoffs):**
  - Pros: fast to implement; generally reliable for simple cuts; fits "selects stringout" workflow.
  - Cons: limited metadata/effects support; multi-track complexity is constrained.
- **Impact on MVP:**
  - Export produces a simple timeline of approved selects.
  - Audio must be handled explicitly (camera scratch + optional external "master" audio).
- **Follow-ups:** None.

---

## Decision: External "master" audio sync via waveform matching (MVP)
- **Date:** 2026-02-04
- **Context:** Interview shoots often have camera scratch audio plus a higher-quality external recorder track. We want an automatic UX similar to Premiere's "Synchronize… by Audio".
- **Options considered:**
  - Timecode-based sync (requires reliable timecode / jam sync)
  - Waveform-based sync (automatic; more compute)
  - Manual sync point (simplest; more user effort)
- **Decision:** Use **waveform-based sync** as the MVP default (timecode can be a later fallback).
- **Why (tradeoffs):**
  - Pros: best UX; works even when timecode is missing/unreliable; familiar to Premiere users.
  - Cons: slower on long recordings; can fail in noisy/low-similarity audio.
- **Impact on MVP:**
  - Ingest includes audio extraction for camera + external audio.
  - Pipeline computes offset and aligns external audio to camera video.
- **Follow-ups:** None.

---

## Decision: Audio Export Behavior in Timeline
- **Date:** 2026-02-04
- **Context:** When exporting selects to Premiere, need to define which audio tracks are included and their default state.
- **Options considered:**
  - A) Master audio only (best quality; simplest)
  - B) Master audio + camera scratch (scratch muted by default)
  - C) Camera scratch only (not recommended)
- **Decision:** **Option B** - Master audio as primary track, camera scratch included but muted by default.
- **Why (tradeoffs):**
  - Pros: gives editors flexibility to unmute scratch if needed; master audio is primary (best quality); matches professional workflow.
  - Cons: slightly more complex export (two audio tracks vs one).
- **Impact on MVP:** EDL export must include both audio tracks with scratch muted by default.
- **Follow-ups:** None.

---

## Decision: Desktop framework choice
- **Date:** 2026-02-04
- **Context:** We need a desktop shell for a modern UI plus background media/transcription jobs.
- **Options considered:**
  - Electron + React (fastest path, huge ecosystem)
  - Tauri + React (lighter footprint, more setup/constraints)
- **Decision:** **Electron + React** for the MVP/case study.
- **Why (tradeoffs):**
  - Pros: lowest friction; lots of examples for file access, background processing, and packaging; faster to ship MVP.
  - Cons: larger app size; potentially higher memory usage.
- **Impact on MVP:** Foundation for desktop app development with React UI.
- **Follow-ups:** None.

---

## Decision: Mock Data Strategy for MVP Testing
- **Date:** 2026-02-04
- **Context:** Need to test the full pipeline (transcription → selects → timeline → export) without cloud API costs.
- **Options considered:**
  - A) Pre-generated mock selects (hardcoded JSON)
  - B) Rule-based generator (keyword matching)
  - C) Stock footage + real Whisper transcription + mock/rule-based selects
- **Decision:** **Option C** - Stock footage + real Whisper transcription + mock/rule-based selects.
- **Why (tradeoffs):**
  - Pros: most realistic for case study demos; tests real transcription pipeline; still free (local Whisper).
  - Cons: requires real transcription processing (slower than pure mocks).
- **Impact on MVP:** Enables realistic testing without cloud costs; sets up abstraction layer for future cloud LLM integration.
- **Follow-ups:** Design transcription provider abstraction to swap in cloud APIs later.

---

## Decision: Context Input UX Approach
- **Date:** 2026-02-04
- **Context:** Users need to provide context (target length, story, cadence) to guide AI select generation.
- **Options considered:**
  - A) Single text field (freeform)
  - B) Structured form only
  - C) Hybrid (structured form + conversational chat interface)
- **Decision:** **Option C** - Hybrid approach with structured form fields + conversational chat interface (like Cursor/ChatGPT).
- **Why (tradeoffs):**
  - Pros: matches modern chatbot UX patterns; gives users flexibility; more impressive for case study.
  - Cons: more complex to build than simple form.
- **Impact on MVP:** Chat interface prioritized first (more impressive), structured fields can be added incrementally.
- **Follow-ups:** Design chat component with voice input and file upload capabilities.

---

## Decision: Project Data Storage
- **Date:** 2026-02-04
- **Context:** Need to store project data (transcripts, selects, timeline, media metadata).
- **Options considered:**
  - A) Local JSON files (one file per project)
  - B) SQLite database
- **Decision:** **Option B** - SQLite database.
- **Why (tradeoffs):**
  - Pros: better architectural thinking for case study; structured queries; relationships; scales better; shows engineering judgment.
  - Cons: slightly more setup (schema design) but sets up proper data architecture.
- **Impact on MVP:** Requires schema design for Project → Media → Transcript → Selects relationships.
- **Follow-ups:** Design schema for Project → Media → Transcript → Selects relationships.

---

## Decision: Timeline/Review UI Approach
- **Date:** 2026-02-04
- **Context:** Users need to review and approve/reject interview selects.
- **Options considered:**
  - A) List view (vertical list with play buttons)
  - B) Timeline strip view (horizontal timeline like Premiere)
- **Decision:** **Option B** - Timeline strip view with bidirectional sync.
- **Why (tradeoffs):**
  - Pros: matches how editors actually work; aligns with Premiere export workflow; more impressive for case study.
  - Cons: more complex to build but provides professional-grade UX.
- **Impact on MVP:**
  - Two-tab interface: "Transcript" tab (current select's transcript) + "Interview Selects" tab (vertical list of all selects).
  - Bidirectional sync: Timeline trim handles ↔ highlighted transcript segments.
  - Requires word-level timestamps for transcript-to-timeline mapping.
- **Follow-ups:** Implement word-level timestamp mapping for transcript segments.

---

## Decision: MVP Development Workflow
- **Date:** 2026-02-04
- **Context:** Order of operations for building MVP (design system vs tech stack).
- **Options considered:**
  - A) Extract design tokens first, then tech stack setup, then build components incrementally
  - B) Tech stack first, then design system
- **Decision:** **Option A** - Design tokens first, then tech stack, then incremental component building.
- **Why (tradeoffs):**
  - Pros: tokens inform tech setup; prevents refactoring; components built as screens demand them (token-efficient).
  - Cons: requires design system refinement upfront.
- **Impact on MVP:** User will refine design system in Figma first, then we extract tokens, then scaffold Electron + React with tokens wired in.
- **Follow-ups:** Create token extraction guide when design system is ready.

---

## Decision: Select Length/Style Configuration
- **Date:** 2026-02-04
- **Context:** How should the AI determine whether to generate fewer/longer selects vs more/shorter selects?
- **Options considered:**
  - A) Fixed approach (fewer/longer or more/shorter)
  - B) Configurable per-project via context prompt
- **Decision:** **Option B** - Configurable per-project via context prompt (target length, story, cadence, etc.).
- **Why (tradeoffs):**
  - Pros: gives users control; adapts to different project needs; keeps MVP flexible.
  - Cons: requires context input UI (already decided).
- **Impact on MVP:** Context input must support project-specific parameters for select generation.
- **Follow-ups:** None.

---

## Decision: Transcription Provider Architecture
- **Date:** 2026-02-04
- **Context:** Need transcription capability but want flexibility to swap providers (local vs cloud) without refactoring.
- **Options considered:**
  - A) Hardcode local Whisper only
  - B) Design abstraction layer for swappable providers
- **Decision:** **Option B** - Design transcription provider abstraction layer.
- **Why (tradeoffs):**
  - Pros: future-proof; allows easy swap to cloud APIs later; shows good architectural thinking.
  - Cons: slightly more upfront design work.
- **Impact on MVP:** Start with local Whisper implementation behind abstraction; can swap in cloud APIs later.
- **Follow-ups:** Design provider interface/abstraction.

---

## Decision: LLM Provider Architecture (Selects Generation)
- **Date:** 2026-02-04
- **Context:** Need to generate selects from transcripts but want to avoid cloud API costs for MVP testing.
- **Options considered:**
  - A) Local LLM only (Ollama + Llama)
  - B) Cloud LLM API only (OpenAI/Anthropic)
  - C) Design for cloud API but use mock data for MVP
- **Decision:** **Option C** - Design architecture for cloud LLM API but use mock/rule-based selects for MVP testing.
- **Why (tradeoffs):**
  - Pros: no cloud costs for MVP; tests full pipeline; sets up proper architecture for production.
  - Cons: mock selects may not be as realistic as real LLM output.
- **Impact on MVP:** Cloud LLM abstraction layer designed but not implemented; mock data used for testing.
- **Follow-ups:** Implement cloud LLM integration when ready for production.
