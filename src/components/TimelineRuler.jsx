import React, { useMemo } from 'react';

const FPS = 24;
/** Min px between small notches when zoomed out—avoids chunkiness */
const SMALL_NOTCH_MIN_SPACING_PX = 6;
/** When ppf >= this, use per-frame notches (24 fps = one notch per frame) */
const PER_FRAME_NOTCHES_MIN_PX_PER_FRAME = 3;
/** Max small notch DOM elements — caps density to avoid slowdown on long clips */
const MAX_SMALL_NOTCHES = 2000;

/** Find smallest divisor of major that is >= minFrames (for even spacing) */
function smallestDivisorAtLeast(majorFrames, minFrames) {
  if (majorFrames <= 0 || minFrames <= 0) return 1;
  if (minFrames >= majorFrames) return majorFrames;
  for (let d = minFrames; d <= majorFrames; d++) {
    if (majorFrames % d === 0) return d;
  }
  return majorFrames;
}

/** All divisors of n, ascending */
function divisors(n) {
  const d = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d;
}

/**
 * Shared timeline ruler for 24fps: tall at timestamps, small between.
 * All notches are DOM elements positioned with frameToPx — single source of truth, no gaps or overlays.
 */
function TimelineRuler({
  contentWidthPx,
  pixelsPerFrame,
  frameToPx,
  rulerTicks,
  framesToTimecode,
  onClick,
  endFrame,
}) {
  const effectivePx = Math.max(0.5, pixelsPerFrame);
  const tickStepFrames =
    rulerTicks.length >= 2 ? rulerTicks[1].frame - rulerTicks[0].frame : FPS;
  const lastTickFrame = rulerTicks[rulerTicks.length - 1]?.frame ?? 0;
  /* endFrame lets the small-notch band run past the last major label tick so at low
     zoom the notches continue all the way to the viewport edge. Falls back to the last
     label tick when the ruler isn't extended. */
  const durationFrames = Math.max(lastTickFrame, Math.floor(endFrame) || 0);
  const majorFrames = useMemo(
    () => new Set(rulerTicks.map((t) => t.frame)),
    [rulerTicks]
  );

  const { smallNotchFrames, showSmallNotches } = useMemo(() => {
    const usePerFrame =
      effectivePx >= PER_FRAME_NOTCHES_MIN_PX_PER_FRAME && tickStepFrames >= 1;
    let smallStepFrames = usePerFrame
      ? 1
      : smallestDivisorAtLeast(
          tickStepFrames,
          Math.max(1, Math.ceil(SMALL_NOTCH_MIN_SPACING_PX / effectivePx))
        );

    const smallStepPx = (tickStepFrames / smallStepFrames) * effectivePx;
    const wouldShow =
      usePerFrame ||
      (smallStepPx >= SMALL_NOTCH_MIN_SPACING_PX &&
        smallStepFrames < tickStepFrames);

    function collectFrames(step) {
      const f = [];
      for (let frame = step; frame < durationFrames; frame += step) {
        if (!majorFrames.has(frame)) f.push(frame);
      }
      return f;
    }

    let frames = collectFrames(smallStepFrames);

    if (wouldShow && frames.length > MAX_SMALL_NOTCHES) {
      const divs = divisors(tickStepFrames);
      let idx = divs.indexOf(smallStepFrames);
      while (idx < divs.length - 1 && frames.length > MAX_SMALL_NOTCHES) {
        idx += 1;
        smallStepFrames = divs[idx];
        frames = collectFrames(smallStepFrames);
      }
    }

    const show = wouldShow && frames.length > 0 && frames.length <= MAX_SMALL_NOTCHES;
    return {
      smallNotchFrames: show ? frames : [],
      showSmallNotches: show,
    };
  }, [
    effectivePx,
    tickStepFrames,
    durationFrames,
    majorFrames,
  ]);

  return (
    <div
      className={`playback-module__timeline-ruler${showSmallNotches ? ' playback-module__timeline-ruler--small-notches' : ''}`}
      style={{ width: contentWidthPx }}
      onClick={onClick}
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
      <div className="playback-module__ruler-notch-band">
        {smallNotchFrames.map((frame) => (
          <div
            key={frame}
            className="playback-module__ruler-notch playback-module__ruler-notch--small"
            style={{ left: frameToPx(frame) }}
            aria-hidden="true"
          />
        ))}
        {rulerTicks.map(({ frame }) => (
          <div
            key={`major-${frame}`}
            className="playback-module__ruler-notch playback-module__ruler-notch--major"
            style={{ left: frameToPx(frame) }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

export default TimelineRuler;
