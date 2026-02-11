# Transcript per clip and read-along — implementation plan

This document covers: (1) ensuring every timeline clip is transcribed and shown in the Transcript tab, (2) read-along behavior, (3) empty-state messaging (no audio vs could not transcribe), and (4) **prioritized failure modes and mitigations**.

---

## Part 1: Trigger transcription for every clip

- **IPC:** Add `transcription:runForProject(projectId)` in `electron/main.js`; expose `transcription.runForProject(projectId)` in `electron/preload.js`.
- **Timeline:** On mount (when `project?.id` is set), run `runForProject(project.id)` in the background (see Part 4 for guards). When the promise resolves, refetch transcript for the *current* selected clip and update state only if that clip is still selected (see Part 4).

## Part 2: Transcript tab and read-along

- Per-clip transcript and read-along (highlight + scroll + click-to-seek) are already implemented. No structural changes needed once transcription runs and refetch race is handled.

## Part 3: Empty-state messaging

- **No audio** (could not extract audio) → show **"No audio to transcribe"**.
- **Could not transcribe** (Whisper failed / no speech / no row) → show **"Could not generate transcript"**.

Implementation:

- **Schema:** Add `empty_reason TEXT` to `transcripts` (nullable). Values: `'no_audio'`, `'transcription_failed'`; `NULL` = normal transcript.
- **Backend:** `insertEmptyTranscript(db, mediaId, reason)`; call with `'no_audio'` when extraction fails, `'transcription_failed'` when Whisper returns null/empty. Include `emptyReason` in `getTranscriptByMediaId` response.
- **Migration:** For existing DBs, run `ALTER TABLE transcripts ADD COLUMN empty_reason TEXT;` (or handle missing column in code: treat as generic failure).
- **Frontend:** Timeline stores and passes `transcriptEmptyReason` to TranscriptPanel; panel uses it to pick message when there are no lines but a clip is selected.

---

## Part 4: Failure modes and mitigations (prioritized)

Implement in this order so the most critical bugs are prevented first, then one-off and UX improvements.

---

### Tier 1 — Critical (must fix or feature breaks)

**1. Race when refetching after `runForProject`**

- **Risk:** When `runForProject` completes we refetch for the current `selectedSelectId` and call `setTranscriptLines`. If the user has switched clips, we overwrite state with the wrong clip’s transcript.
- **Mitigation:** Before updating transcript state with the refetched result, confirm the selected clip is still the one we refetched. When `runForProject` resolves, capture `const mediaIdToRefresh = selectedSelectId` (use a ref so you have the latest). After `getByMediaId(mediaIdToRefresh)` returns, only call `setTranscriptLines(...)` if the current selected clip is still `mediaIdToRefresh` (e.g. `setTranscriptLines(prev => selectedSelectIdRef.current === mediaIdToRefresh ? wordsToLines(data?.words) : prev)` or equivalent). Never overwrite transcript when the user has already switched clips.

**2. Running `runForProject` more than once per project**

- **Risk:** Effect runs on re-renders or project id in deps; multiple `runForProject` runs for the same project.
- **Mitigation:** Use a ref (e.g. `transcriptionStartedForProjectId`) and only call `runForProject(project.id)` when the ref does not already equal `project.id`. After starting, set the ref to `project.id`. When `project.id` changes (user switched project), allow the new project to run by resetting/updating the ref so the effect can run once for the new id.

**3. Unhandled promise rejection**

- **Risk:** Fire-and-forget `runForProject` with no `.catch()` leads to unhandled rejection if main process throws.
- **Mitigation:** Always attach `.catch(err => { console.error(...); })` (and optionally show a non-blocking toast). Only refetch and update UI inside `.then()` when the run succeeded.

---

### Tier 2 — Important (wrong UX or data without these)

**4. Passing `emptyReason` for the two messages**

- **Risk:** TranscriptPanel only receives an array of lines; it can’t show “No audio to transcribe” vs “Could not generate transcript.”
- **Mitigation:** When loading transcript, Timeline stores `transcriptEmptyReason` (e.g. `data?.emptyReason ?? null` when transcript is empty; null when transcript has content). Pass it to TranscriptPanel. Panel shows “No audio to transcribe” when `transcriptEmptyReason === 'no_audio'`, “Could not generate transcript” otherwise when there are no lines but a clip is selected. When there is no transcript row (null), show “Could not generate transcript.”

**5. Existing DBs and missing `empty_reason` column**

- **Risk:** Old installs don’t have the column; reads get `undefined`.
- **Mitigation:** Run a one-time migration (e.g. in `electron/db/index.js` or a migration script): `ALTER TABLE transcripts ADD COLUMN empty_reason TEXT;` (guard with “column doesn’t exist” if needed). In code, treat missing/undefined `empty_reason` as generic failure and show “Could not generate transcript” for empty transcripts.

---

### Tier 3 — One-off / edge cases

**6. Two `runForProject` runs in flight**

- **Risk:** User opens Timeline (run 1 starts), navigates away and back; effect runs again and starts run 2. Duplicate work and possible refetch confusion.
- **Mitigation:** Use a ref `transcriptionInProgress`. Set true when starting `runForProject`, set false when the promise settles (in both `.then()` and `.catch()`). Do not start a new `runForProject` while `transcriptionInProgress` is true. Combined with “once per project” (Tier 1 #2), this avoids duplicate runs.

**7. Transcription failures invisible to the user**

- **Risk:** Whisper/FFmpeg not set up or many clips fail; user only sees “Could not generate transcript” everywhere with no explanation.
- **Mitigation:** When `runForProject` returns and `errors.length > 0`, surface a brief message (e.g. “Transcription failed for some clips” or “Transcription unavailable – check Whisper/FFmpeg setup”) so the user knows it’s a setup/failure issue. Can be a small banner or toast on Timeline, or a single line above the transcript area when the selected clip has no transcript and there were errors.

**8. Read-along: scroll only when Transcript tab is active**

- **Risk:** Scrolling the active line into view while the user is on “Interview Selects” or “Clip info” can be confusing.
- **Mitigation:** In TranscriptPanel, only call `activeLineRef.current.scrollIntoView(...)` when `activeTab === 'transcript'`. Leave highlight and click-to-seek as-is.

---

## Implementation checklist

- [x] IPC `transcription:runForProject` + preload.
- [x] Timeline: run `runForProject` on mount with Tier 1 #2 (once per project) and Tier 3 #6 (not while in progress).
- [x] Timeline: on `runForProject` resolve, refetch transcript for current selected clip with Tier 1 #1 (only update if still same clip) and Tier 1 #3 (.catch).
- [x] Schema: add `empty_reason`; migration for existing DBs (Tier 2 #5).
- [x] Backend: `insertEmptyTranscript(db, mediaId, reason)`; return `emptyReason` from `getTranscriptByMediaId` (Tier 2 #4).
- [x] Timeline: pass `transcriptEmptyReason` to TranscriptPanel (Tier 2 #4).
- [ ] TranscriptPanel: show “No audio to transcribe” / “Could not generate transcript” using `transcriptEmptyReason`.
- [x] Optional: Tier 3 #7 (surface transcription errors); Tier 3 #8 (scroll only when transcript tab active).
