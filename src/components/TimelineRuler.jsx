import React from 'react';

const FPS = 24;
/** Min px between small notches when zoomed out—avoids chunkiness */
const SMALL_NOTCH_MIN_SPACING_PX = 6;
/** When ppf >= this, use per-frame notches (24 fps = one notch per frame) */
const PER_FRAME_NOTCHES_MIN_PX_PER_FRAME = 3;

/** Find smallest divisor of major that is >= minFrames (for even spacing) */
function smallestDivisorAtLeast(majorFrames, minFrames) {
  if (majorFrames <= 0 || minFrames <= 0) return 1;
  if (minFrames >= majorFrames) return majorFrames;
  for (let d = minFrames; d <= majorFrames; d++) {
    if (majorFrames % d === 0) return d;
  }
  return majorFrames;
}

/**
 * Shared timeline ruler for 24fps: tall at timestamps, small between.
 * Zoomed in: one notch per frame (24/sec). Zoomed out: fewer, spaced by zoom.
 * Small step is derived from major so they align perfectly (no gaps).
 */
function TimelineRuler({
  contentWidthPx,
  pixelsPerFrame,
  frameToPx,
  rulerTicks,
  framesToTimecode,
}) {
  const effectivePx = Math.max(0.5, pixelsPerFrame);
  /* Tall notches align with timestamp labels (0.5s, 1s, 5s, etc. at 24fps) */
  const tickStepFrames =
    rulerTicks.length >= 2 ? rulerTicks[1].frame - rulerTicks[0].frame : FPS;
  /* Small notches: per-frame when zoomed in, fewer when zoomed out */
  const usePerFrame =
    effectivePx >= PER_FRAME_NOTCHES_MIN_PX_PER_FRAME && tickStepFrames >= 1;
  const smallStepFrames = usePerFrame
    ? 1
    : smallestDivisorAtLeast(
        tickStepFrames,
        Math.max(1, Math.ceil(SMALL_NOTCH_MIN_SPACING_PX / effectivePx))
      );
  const numSmallPerMajor =
    smallStepFrames > 0 ? tickStepFrames / smallStepFrames : 1;
  /* Use integer small step, derive major = small * count. Guarantees small
     notches land exactly on tall positions—perfect alignment. */
  const idealSmallPx = effectivePx * smallStepFrames;
  const smallStepPx = Math.max(1, Math.round(idealSmallPx));
  const majorStepPx =
    numSmallPerMajor >= 1
      ? smallStepPx * numSmallPerMajor
      : Math.max(1, Math.round(effectivePx * tickStepFrames));
  const showSmallNotches =
    usePerFrame ||
    (smallStepPx >= SMALL_NOTCH_MIN_SPACING_PX &&
      smallStepFrames < tickStepFrames);

  return (
    <div
      className={`playback-module__timeline-ruler${showSmallNotches ? ' playback-module__timeline-ruler--small-notches' : ''}`}
      style={{
        width: contentWidthPx,
        '--ruler-notch-major-step-px': `${majorStepPx}px`,
        '--ruler-notch-small-step-px': `${smallStepPx}px`,
        '--ruler-notch-major-height': 'var(--spacing-md)',
        '--ruler-notch-small-height': 'var(--spacing-xs)',
      }}
    >
      <div className="playback-module__ruler-labels">
        {rulerTicks.map(({ frame }) => (
          <div
            key={frame}
            className="playback-module__ruler-tick"
            style={{ left: frameToPx(frame) }}
          >
            <span className="playback-module__ruler-tick-label">
              {framesToTimecode(frame)}
            </span>
          </div>
        ))}
      </div>
      <div className="playback-module__ruler-spacer" aria-hidden="true" />
      <div className="playback-module__ruler-notches" aria-hidden="true" />
    </div>
  );
}

export default TimelineRuler;
