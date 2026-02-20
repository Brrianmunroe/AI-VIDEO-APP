# Plan: Fix Waveform Cut-off and Related Issues

**Date:** 2026-02-20  
**Scope:** Timeline Review page and shared PlaybackModule / AudioWaveform

---

## Diagnosis: How to Enable Debug Mode

The issue started when switching to the canvas-based waveform. Use this to trace where the pipeline breaks:

### 1. Enable frontend debug (URL or localStorage)

**Option A — URL:**
- Add `?waveformDebug=1` to the app URL, e.g. `http://localhost:5173/#/timeline-review?waveformDebug=1`

**Option B — LocalStorage:**
- Open DevTools (F12 or Cmd+Opt+I) → Console
- Run: `localStorage.setItem('waveformDebug', '1')`
- Reload the page

### 2. Reproduce the issue
- Go to Timeline Review (or Interview Selects)
- Load a clip with audio
- Scroll horizontally to the cut-off area (e.g. around 12 seconds)
- Open the **Console** tab and watch the logs

### 3. What the logs tell you

| Log | What it means |
|-----|----------------|
| `[AudioWaveform] mount:` | Props the waveform received: `width`, `height`, `startSec`, `endSec`, `tileCount` |
| `[AudioWaveform] tile N:` | Each tile's `tilePx`, `tStart`, `tEnd` — check that tilePx matches the intended width |
| `[WaveformTile] getWindow request:` | What we're asking the backend for (`pixelWidth` = w) |
| `[WaveformTile] getWindow OK:` | Backend returned data; `minsLen`/`maxsLen` should equal `pixelWidth` |
| `[WaveformTile] getWindow bad result:` | Backend returned wrong shape (no success, or mins/maxs not arrays) |
| `[WaveformTile] getWindow error:` | Backend threw (e.g. ffmpeg missing, media not found) |
| `[WaveformTile] draw done:` | After drawing: `drawW`, `drawH`, `colCount`, `getBoundingClientRect` — **rect.width vs drawW** reveals CSS squeezing |

### 4. Red border
With debug on, each canvas tile gets a **red outline** so you can see its real rendered bounds. If the red box is narrower than expected, layout/CSS is shrinking it.

### 5. Backend logs (Electron)
- If you run with `WAVEFORM_DEBUG=1` or `--waveform-debug`, main process logs each getWindow call.
- Empty results and errors are always logged to the **terminal** (where you ran `npm run dev` or `npm start`).

### 6. Turn off debug
- Remove `?waveformDebug=1` from the URL, or run `localStorage.removeItem('waveformDebug')` and reload.

---

## Summary

The waveform appears horizontally cut off (especially around 12 seconds when scrolling) because each canvas tile has no explicit size, so it renders at the browser default (~300×150 px) instead of the intended tile width (e.g. 576 px or 4096 px). Fixing canvas sizing is the primary fix; a few related issues are also addressed.

---

## Issue 1: Canvas Has No Explicit Dimensions (Primary Root Cause)

### Problem
- `WaveformTile` renders `<canvas ref={canvasRef} className="audio-waveform__tile" />` with **no `width`, `height`, or `style`**.
- Canvas defaults to intrinsic size ~300×150 px.
- `draw()` uses `canvas.getBoundingClientRect()` for `drawW` and `drawH`, so it ends up using the displayed rect (e.g. ~300 px width) instead of the tile’s intended pixel width (`w`).
- Tiles are drawn too narrow; the waveform looks cut off horizontally.

### Fix (AudioWaveform.jsx)
1. Give the canvas explicit size in JSX:
   ```jsx
   return (
     <canvas
       ref={canvasRef}
       className="audio-waveform__tile"
       width={w}
       height={h}
       style={{ width: w, height: h }}
     />
   );
   ```
2. In `draw()`, use `w` and `h` directly instead of `getBoundingClientRect()`:
   - Replace `drawW`/`drawH` with `w`/`h`.
   - Remove the `rect` lookup.
   - Keep DPR scaling for crisp rendering on retina (canvas internal size = `w * dpr`, `h * dpr`; style keeps display size at `w`, `h`).

### Why
- Canvas needs explicit dimensions to match the visual width passed to `getWindow()`.
- Using `getBoundingClientRect()` was unreliable because the canvas had no explicit size and could be stretched/clipped by layout.

---

## Issue 2: TimelineReview CSS Overrides Timeline Overflow

### Problem
- `PlaybackModule.css` sets `.playback-module__timeline { overflow: visible }` so the timeline content can extend beyond the container.
- `TimelineReview.css` overrides with `.timeline-review__main .playback-module__timeline { overflow: hidden }`, which can clip the waveform when it extends horizontally.

### Fix (TimelineReview.css)
- Change `overflow: hidden` to `overflow: visible` for the timeline inside Timeline Review, or remove the override so the base PlaybackModule styles apply.
- Ensure the viewport (`playback-module__timeline-viewport`) retains `overflow-x: auto` and `overflow-y: hidden` for scrolling.

### Verification
- Confirm horizontal scroll still works and the waveform is no longer clipped at the right edge.

---

## Issue 3: Draw Loop Uses rect When Canvas Has Size

### Problem
- In `draw()`, `const rect = canvas.getBoundingClientRect()` and `drawW = rect.width || w` can still be wrong if layout or transforms alter the rect.

### Fix (covered in Issue 1)
- Once we pass `w` and `h` explicitly and set `width`/`height`/`style` on the canvas, always use `w` and `h` in `draw()` instead of `rect`. DPR should scale the internal buffer, not the logical size.

---

## Issue 4: Backend / IPC (Optional Verification)

### Current state
- `waveformService.getWindow()` returns `{ mins, maxs, durationSec, startSec, endSec }`.
- `main.js` IPC handler returns `{ success: true, ...result }`, so the frontend gets `{ success: true, mins, maxs, ... }`.
- Frontend checks `result?.success && Array.isArray(result.mins) && Array.isArray(result.maxs)` — this should pass when backend succeeds.

### If waveform is still flat or missing after canvas fix
- Add temporary `console.warn` in the IPC handler when `result.mins.length === 0` or when an error is caught.
- Add temporary logging in `WaveformTile` when `setWaveData(FLAT_RESULT)` is called, to distinguish:
  - API missing (`!api?.getWindow`)
  - Backend error (`.catch` handler)
  - Invalid response (`!result?.success` or non-array mins/maxs)

---

## Implementation Order

| Step | Task | File(s) |
|------|------|---------|
| 1 | Add explicit `width`, `height`, and `style` to canvas in WaveformTile | `AudioWaveform.jsx` |
| 2 | Use `w` and `h` in `draw()` instead of `getBoundingClientRect()` | `AudioWaveform.jsx` |
| 3 | Fix TimelineReview overflow override | `TimelineReview.css` |
| 4 | Verify waveform displays correctly when scrolling | Manual |
| 5 | (Optional) Add dev-only logging if issues persist | `AudioWaveform.jsx`, `main.js` |
| 6 | Remove logging after verification | Same |

---

## Verification Checklist

- [ ] Waveform spans full clip width on Timeline Review (Interview Selects and Review).
- [ ] Waveform stays aligned with video track when scrolling horizontally.
- [ ] No horizontal cut-off near 12 seconds or at any scroll position.
- [ ] Waveform looks correct at different zoom levels.
- [ ] No new layout or scroll regressions.
- [ ] Works in both Electron and browser dev (where waveform may show "Waveform unavailable" if IPC missing).

---

## Out of Scope (Known Limitations)

- **Per-segment waveforms** in editable timeline mode use the same `AudioWaveform` component; the canvas fix applies there as well.
- **Lazy tile loading**: All tiles render upfront; deferred for future optimization.
- **Design-system tokens**: Waveform styling already uses tokens; no changes needed.
