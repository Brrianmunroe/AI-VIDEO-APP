import React, { useState, useRef, useCallback, useEffect } from 'react';
import Icon from './Icon';
import AudioWaveform from './AudioWaveform';
import TimelineRuler from './TimelineRuler';
import './styles/PlaybackModule.css';

const FPS = 24;
const MIN_PX_PER_FRAME = 0.5;
const MAX_PX_PER_FRAME = 20;
const DEFAULT_PX_PER_FRAME = 2;
/** Minimum horizontal pixels between timecode labels to avoid overlap */
const MIN_LABEL_SPACING_PX = 80;
/** Premiere-style intervals: 0.5s, 1s, 5s, 10s, 30s, 1min at 24fps */
const NICE_INTERVALS_FRAMES = [12, 24, 120, 240, 720, 1440];

const TOOLBAR_BUTTONS = [
  { id: 'back', icon: 'back', label: 'Back', tooltip: 'Previous clip' },
  { id: 'undo', icon: 'undo', label: 'Undo', tooltip: 'Undo' },
  { id: 'mark-in', icon: 'mark-in', label: 'Mark In', tooltip: 'Mark In' },
  { id: 'play', icon: 'play', label: 'Play', tooltip: 'Play' },
  { id: 'mark-out', icon: 'mark-out', label: 'Mark Out', tooltip: 'Mark Out' },
  { id: 'clear-in', icon: 'clear-selection', label: 'Clear In', tooltip: 'Clear selection' },
  { id: 'forward', icon: 'forward', label: 'Next', tooltip: 'Next clip' },
];

function framesToTimecode(frames, fps = FPS) {
  const f = Math.floor(Math.max(0, frames));
  const ff = f % fps;
  const s = Math.floor(f / fps) % 60;
  const m = Math.floor(f / (fps * 60)) % 60;
  const h = Math.floor(f / (fps * 3600));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(ff)}`;
}

/**
 * Premiere Pro-style ruler ticks: scale-adaptive labels.
 * Zoomed out: 10s, 30s, 1min. Medium: 1s, 5s. Zoomed in: 0.5s (no per-frame labels).
 */
function getRulerTicks(durationFrames, pixelsPerFrame) {
  if (durationFrames <= 0) return [];
  const minFramesPerTick = Math.ceil(MIN_LABEL_SPACING_PX / pixelsPerFrame);
  const tickEveryFrames = NICE_INTERVALS_FRAMES.find((n) => n >= minFramesPerTick) ?? Math.max(1, minFramesPerTick);
  const ticks = [];
  for (let f = 0; f <= durationFrames; f += tickEveryFrames) {
    ticks.push({ frame: f });
  }
  if (ticks[ticks.length - 1]?.frame !== durationFrames) {
    ticks.push({ frame: durationFrames });
  }
  return ticks;
}

const MOCK_VIDEO_CLIPS = [{ id: 'v1', startFrame: 0, durationFrames: 1152, label: 'Clip 1' }];
const MOCK_AUDIO_CLIPS = [{ id: 'a1', startFrame: 0, durationFrames: 1152, label: 'Audio 1' }];

const MAX_CONTENT_WIDTH_PX = 50000;

/** Catches waveform render errors so the rest of the timeline stays usable. */
class WaveformErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="playback-module__waveform-fallback"
          style={this.props.fallbackStyle}
          aria-hidden="true"
        >
          <span className="playback-module__waveform-fallback-label">Waveform unavailable</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function PlaybackModule({
  className = '',
  videoUrl,
  selectedMediaId,
  preloadedWaveform,
  durationSec = 0,
  currentTimeSec = 0,
  isPlaying = false,
  onTimeUpdate,
  onSeek,
  onPlayStateChange,
  videoClips: videoClipsProp,
  durationFrames: durationFramesProp,
  toolbarExtra,
  highlightRanges: highlightRangesProp = [],
  onAddHighlightFromInOut,
  onHighlightInOutChange,
  onRemoveHighlight,
  editableTimeline = false,
  onSegmentTrim,
  mediaDurationById = {},
  selectedSegmentId,
  onSelectSegment,
  onSplitAtPlayhead,
  onDeleteSegment,
  showFullClipTimeline = false,
  preloadedWaveformByMediaId = {},
}) {
  const highlightRanges = Array.isArray(highlightRangesProp) ? highlightRangesProp : [];
  const isControlled = videoUrl != null && typeof onSeek === 'function';
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [internalPlayheadFrame, setInternalPlayheadFrame] = useState(0);
  const [inPointFrame, setInPointFrame] = useState(null);
  const [outPointFrame, setOutPointFrame] = useState(null);
  const [internalVideoClips] = useState(MOCK_VIDEO_CLIPS);
  const [audioClips] = useState(MOCK_AUDIO_CLIPS);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(DEFAULT_PX_PER_FRAME);
  const [selectedHighlightId, setSelectedHighlightId] = useState(null);
  const [draggingHighlight, setDraggingHighlight] = useState(null);
  const [draggingSegmentHandle, setDraggingSegmentHandle] = useState(null);
  const [viewportContentWidthPx, setViewportContentWidthPx] = useState(0);

  const videoRef = useRef(null);
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const isDraggingRef = useRef(false);
  const playheadFrameRef = useRef(0);

  const LABEL_COLUMN_PX = 64;

  // Measure timeline viewport so content can fill at least the container width
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateWidth = () => {
      const w = viewport.getBoundingClientRect().width;
      setViewportContentWidthPx(Math.max(0, w - LABEL_COLUMN_PX));
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  const durationSecNum = Number(durationSec);
  const safeDurationSec = Number.isFinite(durationSecNum) && durationSecNum >= 0 ? durationSecNum : 0;
  const fullDurationFrames = isControlled
    ? Math.max(0, Math.round(safeDurationSec * FPS))
    : (Number.isFinite(durationFramesProp) && durationFramesProp >= 0
        ? durationFramesProp
        : (Array.isArray(videoClipsProp) && videoClipsProp.length > 0
            ? videoClipsProp.reduce((sum, c) => sum + (c.durationFrames ?? 0), 0)
            : 2880));

  // When we have highlights, show only the effective segment (selected or single/first highlight)
  const effectiveSegment = React.useMemo(() => {
    if (!isControlled || highlightRanges.length === 0) return null;
    const selected = selectedHighlightId != null
      ? highlightRanges.find((h) => h.id === selectedHighlightId)
      : null;
    if (selected != null && Number(selected.in) < Number(selected.out)) return selected;
    const first = highlightRanges[0];
    if (first != null && Number(first.in) < Number(first.out)) return first;
    return null;
  }, [isControlled, highlightRanges, selectedHighlightId]);

  const segmentStartSec = effectiveSegment != null ? Number(effectiveSegment.in) : 0;
  const segmentEndSec = effectiveSegment != null ? Number(effectiveSegment.out) : safeDurationSec;
  const segmentDurationSec = Math.max(0, segmentEndSec - segmentStartSec);
  // When showFullClipTimeline is true (e.g. Interview Selects page), always show full clip length and all highlights
  const useFullTimeline = showFullClipTimeline && isControlled && fullDurationFrames > 0;
  const durationFrames = useFullTimeline
    ? fullDurationFrames
    : (effectiveSegment != null
        ? Math.max(0, Math.round(segmentDurationSec * FPS))
        : fullDurationFrames);

  const currentTimeSecNum = Number(currentTimeSec);
  const safeCurrentTimeSec = Number.isFinite(currentTimeSecNum) && currentTimeSecNum >= 0 ? currentTimeSecNum : 0;
  const playheadFrame = isControlled
    ? (useFullTimeline
        ? Math.max(0, Math.min(durationFrames, Math.round(safeCurrentTimeSec * FPS)))
        : (effectiveSegment != null
            ? Math.max(0, Math.min(durationFrames, Math.round((safeCurrentTimeSec - segmentStartSec) * FPS)))
            : Math.max(0, Math.min(durationFrames, Math.round(safeCurrentTimeSec * FPS)))))
    : internalPlayheadFrame;
  const isPlayingState = isControlled ? isPlaying : internalPlaying;
  const videoClips = isControlled
    ? (durationFrames > 0 ? [{ id: 'source', startFrame: 0, durationFrames, label: 'Source' }] : [])
    : (Array.isArray(videoClipsProp) && videoClipsProp.length > 0 ? videoClipsProp : internalVideoClips);

  const currentSequenceSegment = React.useMemo(() => {
    if (!editableTimeline || !videoClips.length) return null;
    return videoClips.find(
      (seg) =>
        playheadFrame >= seg.startFrame &&
        playheadFrame < seg.startFrame + (seg.durationFrames ?? 0)
    );
  }, [editableTimeline, videoClips, playheadFrame]);

  const sequenceVideoUrl =
    currentSequenceSegment != null
      ? `media://local/${currentSequenceSegment.sourceMediaId}`
      : null;
  const displayVideoUrl = isControlled ? videoUrl : sequenceVideoUrl;

  // Playback range: when playing, use selected/first segment or in/out or full clip
  const playbackRangeSec = React.useMemo(() => {
    if (!isControlled || durationFrames <= 0) return null;
    if (!useFullTimeline && effectiveSegment != null) {
      return { startSec: segmentStartSec, endSec: segmentEndSec };
    }
    if (effectiveSegment != null && (selectedHighlightId != null || highlightRanges.length === 1)) {
      return { startSec: segmentStartSec, endSec: segmentEndSec };
    }
    if (inPointFrame != null && outPointFrame != null && outPointFrame > inPointFrame) {
      return { startSec: inPointFrame / FPS, endSec: outPointFrame / FPS };
    }
    return { startSec: 0, endSec: safeDurationSec };
  }, [isControlled, durationFrames, useFullTimeline, effectiveSegment, segmentStartSec, segmentEndSec, selectedHighlightId, highlightRanges.length, inPointFrame, outPointFrame, safeDurationSec]);

  const contentWidthFromDuration = Number.isFinite(durationFrames * pixelsPerFrame)
    ? Math.max(0, durationFrames * pixelsPerFrame)
    : 0;
  const contentWidthPx = Math.max(viewportContentWidthPx, contentWidthFromDuration);
  const effectivePixelsPerFrame = pixelsPerFrame;
  const stripWidthPx = LABEL_COLUMN_PX + contentWidthPx;
  const waveformWidthPx = Math.min(MAX_CONTENT_WIDTH_PX, contentWidthPx);
  /** On controlled timeline (Interview Selects), waveform must match the clip width so they stay in sync when zooming. */
  const singleClipWaveformWidthPx = durationFrames * effectivePixelsPerFrame;

  const pxToFrame = useCallback(
    (px) => {
      const f = px / effectivePixelsPerFrame;
      return Math.max(0, Math.min(durationFrames, Math.round(f)));
    },
    [effectivePixelsPerFrame, durationFrames]
  );

  const frameToPx = useCallback((frame) => frame * effectivePixelsPerFrame, [effectivePixelsPerFrame]);

  const getFrameFromClientX = useCallback(
    (clientX) => {
      const content = contentRef.current;
      if (!content) return null;
      const rect = content.getBoundingClientRect();
      const x = clientX - rect.left;
      return pxToFrame(x);
    },
    [pxToFrame]
  );

  const handleTimelineClick = useCallback(
    (e) => {
      try {
        if (isDraggingRef.current) return;
        if (e.target.closest('.playback-module__playhead')) return;
        if (e.target.closest('.playback-module__highlight-handle')) return;
        const region = e.target.closest('.playback-module__highlight-region');
        if (region) {
          const id = region.getAttribute('data-highlight-id');
          if (id) setSelectedHighlightId(id);
          /* fall through to seek — clicks anywhere on the timeline (including inside highlights) move the playhead */
        } else {
          setSelectedHighlightId(null);
        }
        const frame = getFrameFromClientX(e.clientX);
        if (frame == null) return;
        if (isControlled && onSeek) {
          const seekSec = useFullTimeline ? frame / FPS : (effectiveSegment != null ? segmentStartSec + frame / FPS : frame / FPS);
          onSeek(seekSec);
        } else {
          setInternalPlayheadFrame(frame);
        }
      } catch (err) {
        console.error('[PlaybackModule] timeline click error:', err);
      }
    },
    [getFrameFromClientX, isControlled, onSeek, useFullTimeline, effectiveSegment, segmentStartSec]
  );

  const handlePlayheadMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      const frame = getFrameFromClientX(e.clientX);
      if (frame == null) return;
      if (isControlled && onSeek) {
        const seekSec = useFullTimeline ? frame / FPS : (effectiveSegment != null ? segmentStartSec + frame / FPS : frame / FPS);
        onSeek(seekSec);
      } else {
        setInternalPlayheadFrame(frame);
      }
    };
    const onUp = () => {
      isDraggingRef.current = false;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [getFrameFromClientX, isControlled, onSeek, useFullTimeline, effectiveSegment, segmentStartSec]);

  useEffect(() => {
    if (!draggingHighlight || typeof onHighlightInOutChange !== 'function') return;
    const { highlightId, side } = draggingHighlight;
    const highlight = highlightRanges.find((h) => h.id === highlightId);
    if (!highlight) return;
    const handleMove = (e) => {
      const frame = getFrameFromClientX(e.clientX);
      if (frame == null) return;
      const sec = useFullTimeline
        ? Math.max(0, Math.min(safeDurationSec, frame / FPS))
        : (effectiveSegment != null
            ? Math.max(segmentStartSec, Math.min(segmentEndSec, segmentStartSec + frame / FPS))
            : Math.max(0, Math.min(safeDurationSec, frame / FPS)));
      if (side === 'in') {
        const outSec = Number(highlight.out) ?? safeDurationSec;
        const newIn = Math.min(sec, outSec - 0.05);
        if (newIn >= 0) onHighlightInOutChange(highlightId, { in: newIn });
      } else {
        const inSec = Number(highlight.in) ?? 0;
        const newOut = Math.max(sec, inSec + 0.05);
        if (newOut <= safeDurationSec) onHighlightInOutChange(highlightId, { out: newOut });
      }
    };
    const handleUp = () => setDraggingHighlight(null);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [draggingHighlight, highlightRanges, getFrameFromClientX, onHighlightInOutChange, safeDurationSec, useFullTimeline, effectiveSegment, segmentStartSec, segmentEndSec]);

  useEffect(() => {
    if (!draggingSegmentHandle || typeof onSegmentTrim !== 'function') return;
    const { segmentId, side, startSourceIn, startSourceOut, startFrameAtDragStart } = draggingSegmentHandle;
    const clip = videoClips.find((c) => c.id === segmentId);
    if (!clip || clip.sourceMediaId == null) return;
    const maxDur = Number(mediaDurationById[clip.sourceMediaId]);
    const mediaDur = Number.isFinite(maxDur) && maxDur > 0 ? maxDur : 86400;
    const handleMove = (e) => {
      const frame = getFrameFromClientX(e.clientX);
      if (frame == null) return;
      const deltaFrames = frame - startFrameAtDragStart;
      const deltaSec = deltaFrames / FPS;
      if (side === 'in') {
        let newIn = startSourceIn + deltaSec;
        newIn = Math.max(0, Math.min(newIn, startSourceOut - 0.05, mediaDur));
        onSegmentTrim(segmentId, { sourceInSec: newIn, sourceOutSec: startSourceOut });
      } else {
        let newOut = startSourceOut + deltaSec;
        newOut = Math.max(startSourceIn + 0.05, Math.min(newOut, mediaDur));
        onSegmentTrim(segmentId, { sourceInSec: startSourceIn, sourceOutSec: newOut });
      }
    };
    const handleUp = () => setDraggingSegmentHandle(null);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [draggingSegmentHandle, videoClips, mediaDurationById, getFrameFromClientX, onSegmentTrim]);

  // When showing segment-only view, keep playhead inside the segment (e.g. on load or when switching highlight)
  useEffect(() => {
    if (useFullTimeline || !isControlled || effectiveSegment == null || !onSeek) return;
    const t = Number(currentTimeSec);
    if (t < segmentStartSec - 0.01 || t > segmentEndSec + 0.01) {
      onSeek(segmentStartSec);
    }
  }, [useFullTimeline, isControlled, effectiveSegment, segmentStartSec, segmentEndSec, currentTimeSec, onSeek]);

  useEffect(() => {
    if (isControlled) {
      const video = videoRef.current;
      if (!video) return;
      const t = Math.max(0, Number(currentTimeSec));
      if (Math.abs(video.currentTime - t) > 0.15) {
        video.currentTime = t;
      }
      return;
    }
    if (editableTimeline && currentSequenceSegment && videoRef.current) {
      const video = videoRef.current;
      const inSec = Number(currentSequenceSegment.sourceInSec) || 0;
      const sourceTime = inSec + (playheadFrame - currentSequenceSegment.startFrame) / FPS;
      const t = Math.max(inSec, Math.min(Number(currentSequenceSegment.sourceOutSec) || inSec + 1, sourceTime));
      if (Math.abs(video.currentTime - t) > 0.1) {
        video.currentTime = t;
      }
    }
  }, [isControlled, currentTimeSec, editableTimeline, currentSequenceSegment, playheadFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isControlled) {
      if (isPlaying) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    } else {
      if (isPlayingState) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  }, [isControlled, isPlaying, isPlayingState]);

  playheadFrameRef.current = playheadFrame;

  useEffect(() => {
    if (isControlled || !editableTimeline || !videoClips.length) return;
    const video = videoRef.current;
    if (!video) return;
    if (!isPlayingState) return;

    let rafId = null;
    const tick = () => {
      const v = videoRef.current;
      if (!v || v.paused) return;
      const currentTime = v.currentTime;
      const clips = videoClips;
      const pf = playheadFrameRef.current;
      const segIndex = clips.findIndex(
        (seg) =>
          pf >= seg.startFrame &&
          pf < seg.startFrame + (seg.durationFrames ?? 0)
      );
      const segment = segIndex >= 0 ? clips[segIndex] : null;
      if (!segment) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const inSec = Number(segment.sourceInSec) || 0;
      const outSec = Number(segment.sourceOutSec) ?? inSec + 1;
      const durationFramesSeg = segment.durationFrames ?? Math.round((outSec - inSec) * FPS);
      let timelineFrame = segment.startFrame + (currentTime - inSec) * FPS;
      timelineFrame = Math.max(segment.startFrame, Math.min(segment.startFrame + durationFramesSeg, timelineFrame));

      if (currentTime >= outSec - 0.05) {
        const nextIndex = segIndex + 1;
        const nextSegment = nextIndex < clips.length ? clips[nextIndex] : null;
        if (nextSegment) {
          playheadFrameRef.current = nextSegment.startFrame;
          setInternalPlayheadFrame(nextSegment.startFrame);
          if (nextSegment.sourceMediaId === segment.sourceMediaId) {
            v.currentTime = Number(nextSegment.sourceInSec) || 0;
          }
        } else {
          setInternalPlaying(false);
          playheadFrameRef.current = Math.min(durationFrames, segment.startFrame + durationFramesSeg);
          setInternalPlayheadFrame(playheadFrameRef.current);
        }
      } else {
        playheadFrameRef.current = Math.round(timelineFrame);
        setInternalPlayheadFrame(playheadFrameRef.current);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [isControlled, editableTimeline, isPlayingState, videoClips, durationFrames]);

  useEffect(() => {
    if (isControlled || !editableTimeline || !currentSequenceSegment) return;
    const video = videoRef.current;
    if (!video) return;
    const inSec = Number(currentSequenceSegment.sourceInSec) || 0;
    const onLoaded = () => {
      const v = videoRef.current;
      if (v) {
        v.currentTime = inSec;
        if (isPlayingState) v.play().catch(() => {});
      }
    };
    video.addEventListener('loadeddata', onLoaded);
    return () => video.removeEventListener('loadeddata', onLoaded);
  }, [isControlled, editableTimeline, currentSequenceSegment, isPlayingState]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isControlled || !onTimeUpdate) return;
    const onTimeUpdateEvent = () => {
      onTimeUpdate(video.currentTime);
    };
    video.addEventListener('timeupdate', onTimeUpdateEvent);
    return () => video.removeEventListener('timeupdate', onTimeUpdateEvent);
  }, [isControlled, onTimeUpdate]);

  // Scroll timeline viewport to show playhead when currentTimeSec changes (e.g. transcript click, seek)
  useEffect(() => {
    if (!isControlled || isDraggingRef.current) return;
    const viewport = viewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return;
    const t = Number(currentTimeSec);
    if (!Number.isFinite(t) || t < 0) return;
    const pf = useFullTimeline
      ? Math.max(0, Math.min(durationFrames, Math.round(t * FPS)))
      : (effectiveSegment != null
          ? Math.max(0, Math.min(durationFrames, Math.round((t - segmentStartSec) * FPS)))
          : Math.max(0, Math.min(durationFrames, Math.round(t * FPS))));
    const playheadLeftPx = pf * effectivePixelsPerFrame;
    const playheadScrollX = LABEL_COLUMN_PX + playheadLeftPx;
    const marginPx = 80;
    const inView =
      playheadScrollX >= viewport.scrollLeft &&
      playheadScrollX <= viewport.scrollLeft + viewport.clientWidth;
    if (!inView) {
      viewport.scrollLeft = Math.max(0, Math.min(
        viewport.scrollWidth - viewport.clientWidth,
        playheadScrollX - marginPx
      ));
    }
  }, [
    isControlled,
    currentTimeSec,
    useFullTimeline,
    effectiveSegment,
    segmentStartSec,
    durationFrames,
    effectivePixelsPerFrame,
  ]);

  // High-frequency time updates while playing; stop at end of playback range (highlight or in/out)
  // Also scroll timeline viewport so playhead stays visible (instant scroll when it exits right)
  useEffect(() => {
    if (!isControlled || !isPlayingState) return;
    const video = videoRef.current;
    if (!video) return;
    const range = playbackRangeSec;
    let rafId = null;
    const tick = () => {
      const v = videoRef.current;
      if (!v || v.paused) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const t = v.currentTime;
      if (onTimeUpdate) onTimeUpdate(t);
      if (range != null && t >= range.endSec - 0.05) {
        v.pause();
        v.currentTime = range.startSec;
        if (onPlayStateChange) onPlayStateChange(false);
        if (onSeek) onSeek(range.startSec);
      }
      // Keep playhead in view: scroll when it exits right or is off to the left (e.g. user scrolled past, then hit play)
      if (!isDraggingRef.current) {
        const viewport = viewportRef.current;
        if (viewport && viewport.scrollWidth > viewport.clientWidth) {
          const pf = useFullTimeline
            ? Math.max(0, Math.min(durationFrames, Math.round(t * FPS)))
            : (effectiveSegment != null
                ? Math.max(0, Math.min(durationFrames, Math.round((t - segmentStartSec) * FPS)))
                : Math.max(0, Math.min(durationFrames, Math.round(t * FPS))));
          const playheadLeftPx = pf * effectivePixelsPerFrame;
          const playheadScrollX = LABEL_COLUMN_PX + playheadLeftPx;
          const marginPx = 80;
          const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
          if (playheadScrollX < viewport.scrollLeft) {
            viewport.scrollLeft = Math.max(0, playheadScrollX - marginPx);
          } else if (playheadScrollX > viewport.scrollLeft + viewport.clientWidth) {
            viewport.scrollLeft = Math.min(maxScroll, playheadScrollX - marginPx);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [
    isControlled,
    isPlayingState,
    onTimeUpdate,
    onPlayStateChange,
    onSeek,
    playbackRangeSec,
    useFullTimeline,
    effectiveSegment,
    segmentStartSec,
    durationFrames,
    effectivePixelsPerFrame,
  ]);

  const zoomIn = useCallback(() => {
    setPixelsPerFrame((p) => Math.min(MAX_PX_PER_FRAME, p * 1.5));
  }, []);

  const zoomOut = useCallback(() => {
    setPixelsPerFrame((p) => Math.max(MIN_PX_PER_FRAME, p / 1.5));
  }, []);

  // Scroll wheel zoom on timeline viewport (Ctrl/Cmd + scroll)
  const handleTimelineWheel = useCallback(
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    },
    [zoomIn, zoomOut]
  );

  // Attach wheel listener with passive: false so preventDefault works for zoom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleTimelineWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleTimelineWheel);
  }, [handleTimelineWheel]);

  const handleTogglePlay = useCallback(() => {
    if (isControlled && onPlayStateChange) {
      if (!isPlayingState && playbackRangeSec) {
        const startSec = playbackRangeSec.startSec;
        const endSec = playbackRangeSec.endSec;
        const t = Math.max(startSec, Math.min(endSec, Number(currentTimeSec)));
        if (videoRef.current) videoRef.current.currentTime = t;
        if (onSeek && (currentTimeSec < startSec || currentTimeSec >= endSec)) onSeek(startSec);
      }
      onPlayStateChange(!isPlayingState);
    } else {
      setInternalPlaying((p) => !p);
    }
  }, [isControlled, isPlayingState, onPlayStateChange, onSeek, playbackRangeSec, currentTimeSec]);

  const handlePlayKeyDown = useCallback(
    (e) => {
      if (e.key !== ' ' || e.repeat) return;
      e.preventDefault();
      handleTogglePlay();
    },
    [handleTogglePlay]
  );

  const handleToolbarClick = (id) => {
    if (id === 'play') {
      if (isControlled && onPlayStateChange) {
        if (!isPlayingState && playbackRangeSec) {
          const startSec = playbackRangeSec.startSec;
          const endSec = playbackRangeSec.endSec;
          const t = Math.max(startSec, Math.min(endSec, Number(currentTimeSec)));
          if (videoRef.current) videoRef.current.currentTime = t;
          if (onSeek && (currentTimeSec < startSec || currentTimeSec >= endSec)) onSeek(startSec);
        }
        onPlayStateChange(!isPlayingState);
      } else {
        setInternalPlaying((p) => !p);
      }
      return;
    }
    if (id === 'mark-in') {
      setInPointFrame(playheadFrame);
      if (outPointFrame != null && outPointFrame < playheadFrame) setOutPointFrame(null);
      return;
    }
    if (id === 'mark-out') {
      setOutPointFrame(playheadFrame);
      if (inPointFrame != null && inPointFrame > playheadFrame) setInPointFrame(null);
      if (inPointFrame != null && typeof onAddHighlightFromInOut === 'function') {
        const inSec = inPointFrame / FPS;
        const outSec = playheadFrame / FPS;
        if (outSec > inSec) {
          onAddHighlightFromInOut(inSec, outSec);
          setInPointFrame(null);
          setOutPointFrame(null);
        }
      }
      return;
    }
    if (id === 'clear-in') {
      if (selectedHighlightId != null && typeof onRemoveHighlight === 'function') {
        onRemoveHighlight(selectedHighlightId);
        setSelectedHighlightId(null);
      } else {
        setInPointFrame(null);
        setOutPointFrame(null);
      }
      return;
    }
    if (id === 'back') {
      if (effectiveSegment != null && isControlled && onSeek) {
        onSeek(segmentStartSec);
      } else {
        const targetFrame = inPointFrame != null ? inPointFrame : 0;
        if (isControlled && onSeek) onSeek(targetFrame / FPS);
        else setInternalPlayheadFrame(targetFrame);
      }
      return;
    }
    if (id === 'forward') {
      if (effectiveSegment != null && isControlled && onSeek) {
        onSeek(segmentEndSec);
      } else {
        const targetFrame = outPointFrame != null ? outPointFrame : durationFrames;
        if (isControlled && onSeek) onSeek(targetFrame / FPS);
        else setInternalPlayheadFrame(targetFrame);
      }
      return;
    }
  };

  const rulerTicks = getRulerTicks(durationFrames, effectivePixelsPerFrame);
  const playheadLeftPx = frameToPx(playheadFrame);
  const inLeftPx = inPointFrame != null ? frameToPx(inPointFrame) : null;
  const outLeftPx = outPointFrame != null ? frameToPx(outPointFrame) : null;
  const hasInOut = inPointFrame != null && outPointFrame != null;
  const shadeLeftPx = hasInOut ? frameToPx(Math.min(inPointFrame, outPointFrame)) : null;
  const shadeWidthPx = hasInOut ? frameToPx(Math.abs(outPointFrame - inPointFrame)) : null;

  const highlightRegions = React.useMemo(() => {
    if (useFullTimeline && highlightRanges.length > 0) {
      return highlightRanges.map((h, index) => {
        const inFrame = Math.max(0, Math.round((Number(h.in) || 0) * FPS));
        const outFrame = Math.max(inFrame, Math.round((Number(h.out) || 0) * FPS));
        const durationFramesRegion = Math.min(outFrame - inFrame, fullDurationFrames - inFrame);
        return {
          id: h.id,
          leftPx: frameToPx(inFrame),
          widthPx: frameToPx(durationFramesRegion),
          ordinal: index + 1,
        };
      });
    }
    if (effectiveSegment != null) {
      return [{
        id: effectiveSegment.id,
        leftPx: 0,
        widthPx: contentWidthPx,
        ordinal: 1,
      }];
    }
    if (highlightRanges.length === 0) return [];
    return highlightRanges.map((h, index) => {
      const inFrame = Math.max(0, Math.round((Number(h.in) || 0) * FPS));
      const outFrame = Math.max(inFrame, Math.round((Number(h.out) || 0) * FPS));
      const durationFramesRegion = Math.min(outFrame - inFrame, durationFrames - inFrame);
      return {
        id: h.id,
        leftPx: frameToPx(inFrame),
        widthPx: frameToPx(durationFramesRegion),
        ordinal: index + 1,
      };
    });
  }, [useFullTimeline, effectiveSegment, highlightRanges, durationFrames, fullDurationFrames, frameToPx, contentWidthPx]);

  const waveformSegment = React.useMemo(() => {
    if (useFullTimeline) {
      return { startSec: 0, endSec: safeDurationSec, durationSec: safeDurationSec };
    }
    if (isControlled && effectiveSegment != null) {
      return { startSec: segmentStartSec, endSec: segmentEndSec, durationSec: Math.max(0, segmentEndSec - segmentStartSec) };
    }
    if (!isControlled && currentSequenceSegment) {
      const inSec = Number(currentSequenceSegment.sourceInSec) || 0;
      const outSec = Number(currentSequenceSegment.sourceOutSec) ?? inSec + 1;
      return { startSec: inSec, endSec: outSec, durationSec: Math.max(0, outSec - inSec) };
    }
    return { startSec: 0, endSec: safeDurationSec, durationSec: safeDurationSec };
  }, [useFullTimeline, isControlled, effectiveSegment, currentSequenceSegment, safeDurationSec, segmentStartSec, segmentEndSec]);

  /** Per-segment waveforms: one AudioWaveform per clip, each fetches via getWindow (no preload required) */
  const usePerSegmentWaveforms =
    editableTimeline &&
    videoClips.length > 0;

  const waveformSegmentsList = React.useMemo(() => {
    if (!usePerSegmentWaveforms) return [];
    return videoClips.map((seg) => ({
      seg,
      widthPx: frameToPx(seg.durationFrames ?? 0),
    }));
  }, [usePerSegmentWaveforms, videoClips, frameToPx]);

  const showVideo = displayVideoUrl != null;
  const showPlaceholder = !showVideo;

  return (
    <div
      className={`playback-module ${className}`.trim()}
      role="region"
      aria-label="Playback"
      tabIndex={0}
      onKeyDown={handlePlayKeyDown}
    >
      <div className="playback-module__player-section">
        <div className="playback-module__player">
          {showVideo && (
            <div
              className="playback-module__player-inner"
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePlay();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={handlePlayKeyDown}
              aria-label={isPlayingState ? 'Pause' : 'Play'}
            >
              <video
                ref={videoRef}
                className="playback-module__video"
                src={displayVideoUrl}
                playsInline
                muted={false}
                controls={false}
                aria-label="Video playback"
              />
            </div>
          )}
          {showPlaceholder && (
            <div className="playback-module__player-inner">
              <span className="playback-module__player-label">
                {showVideo ? 'Video' : (isControlled && !videoUrl ? 'Select a clip' : 'Video')}
              </span>
            </div>
          )}
        </div>
        <div className="playback-module__toolbar" role="toolbar" aria-label="Playback controls">
          <div className="playback-module__toolbar-spacer playback-module__toolbar-spacer--left" aria-hidden="true" />
          <div className="playback-module__toolbar-controls">
            {TOOLBAR_BUTTONS.map(({ id, icon, label, tooltip }) => (
              <div key={id} className="playback-module__toolbar-btn-wrap">
                <span className="playback-module__toolbar-tooltip" role="tooltip">
                  {tooltip}
                </span>
                <button
                  type="button"
                  className="playback-module__toolbar-btn"
                  onClick={() => handleToolbarClick(id)}
                  aria-label={label}
                >
                  <Icon
                    type={icon}
                    size="md"
                    state={id === 'play' && isPlayingState ? 'selected' : 'primary'}
                  />
                </button>
              </div>
            ))}
          </div>
          <div className="playback-module__toolbar-extra">
            {toolbarExtra}
          </div>
        </div>
      </div>

      <div className="playback-module__timeline" role="application" aria-label="Video timeline">
        <div className="playback-module__time-display" aria-live="polite">
          <span className="playback-module__time-display-spacer" aria-hidden="true" />
          <span className="playback-module__time-display-text">
            {framesToTimecode(playheadFrame)} / {framesToTimecode(durationFrames)}
          </span>
        </div>
        <div
          className="playback-module__timeline-viewport"
          ref={viewportRef}
          role="group"
          aria-label="Timeline viewport"
        >
          <div
            className="playback-module__timeline-scroll-content"
            style={{ width: stripWidthPx, minWidth: stripWidthPx }}
          >
            <div className="playback-module__ruler-row">
              <div className="playback-module__ruler-row-spacer" aria-hidden="true" />
              <TimelineRuler
                contentWidthPx={contentWidthPx}
                pixelsPerFrame={effectivePixelsPerFrame}
                frameToPx={frameToPx}
                rulerTicks={rulerTicks}
                framesToTimecode={framesToTimecode}
              />
            </div>
            <div
              className="playback-module__timeline-strip"
              style={{ width: stripWidthPx, minWidth: stripWidthPx }}
            >
              <div className="playback-module__timeline-labels">
                <div className="playback-module__track-label">Video</div>
                <div className="playback-module__track-label">Audio</div>
              </div>
              <div
                className="playback-module__timeline-content"
                ref={contentRef}
                style={{ width: contentWidthPx, minWidth: contentWidthPx }}
                onClick={handleTimelineClick}
                role="presentation"
              >
                <div className="playback-module__track playback-module__track--video">
                <div className="playback-module__track-content">
                  {videoClips.map((clip) => (
                    <div
                      key={clip.id}
                      className={`playback-module__clip playback-module__clip--video${editableTimeline && selectedSegmentId === clip.id ? ' playback-module__clip--selected' : ''}`}
                      style={{
                        left: frameToPx(clip.startFrame),
                        width: frameToPx(clip.durationFrames),
                      }}
                      onClick={editableTimeline && onSelectSegment ? (e) => { e.stopPropagation(); onSelectSegment(clip.id); } : undefined}
                      role={editableTimeline ? 'button' : undefined}
                      aria-label={editableTimeline ? clip.label || `Segment ${clip.id}` : undefined}
                    >
                      {editableTimeline && clip.sourceMediaId != null && (
                        <>
                          <span
                            className="playback-module__segment-handle playback-module__segment-handle--in"
                            aria-label={`Trim start of ${clip.label || clip.id}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDraggingSegmentHandle({
                                segmentId: clip.id,
                                side: 'in',
                                startSourceIn: Number(clip.sourceInSec) || 0,
                                startSourceOut: Number(clip.sourceOutSec) || 0,
                                startFrameAtDragStart: clip.startFrame,
                              });
                            }}
                          />
                          <span
                            className="playback-module__segment-handle playback-module__segment-handle--out"
                            aria-label={`Trim end of ${clip.label || clip.id}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDraggingSegmentHandle({
                                segmentId: clip.id,
                                side: 'out',
                                startSourceIn: Number(clip.sourceInSec) || 0,
                                startSourceOut: Number(clip.sourceOutSec) || 0,
                                startFrameAtDragStart: clip.startFrame + (clip.durationFrames ?? 0),
                              });
                            }}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="playback-module__track playback-module__track--audio">
                <div className="playback-module__track-content">
                  {usePerSegmentWaveforms && waveformSegmentsList.length > 0 ? (
                    waveformSegmentsList.map(({ seg, widthPx }) => {
                      const segInSec = Number(seg.sourceInSec) || 0;
                      const segOutSec = Number(seg.sourceOutSec) || (segInSec + 1);
                      return (
                        <div
                          key={seg.id}
                          className="playback-module__clip playback-module__clip--audio playback-module__waveform-clip"
                          style={{
                            left: frameToPx(seg.startFrame),
                            width: widthPx,
                          }}
                        >
                          <WaveformErrorBoundary fallbackStyle={{ width: widthPx, height: 48 }}>
                            <AudioWaveform
                              mediaId={seg.sourceMediaId}
                              startSec={segInSec}
                              endSec={segOutSec}
                              totalWidthPx={widthPx}
                              heightPx={48}
                              durationSec={Math.max(0, segOutSec - segInSec)}
                            />
                          </WaveformErrorBoundary>
                        </div>
                      );
                    })
                  ) : (
                    <WaveformErrorBoundary fallbackStyle={{ width: showVideo && displayVideoUrl ? singleClipWaveformWidthPx : waveformWidthPx, height: 48 }}>
                      {showVideo && displayVideoUrl ? (
                        <div
                          className="playback-module__clip playback-module__clip--audio playback-module__waveform-clip"
                          style={{ left: 0, width: singleClipWaveformWidthPx }}
                        >
                          <AudioWaveform
                            mediaId={currentSequenceSegment?.sourceMediaId ?? selectedMediaId}
                            startSec={waveformSegment.startSec}
                            endSec={waveformSegment.endSec}
                            totalWidthPx={singleClipWaveformWidthPx}
                            heightPx={48}
                            durationSec={waveformSegment.durationSec}
                          />
                        </div>
                      ) : (
                        audioClips.map((clip) => (
                          <div
                            key={clip.id}
                            className="playback-module__clip playback-module__clip--audio"
                            style={{
                              left: frameToPx(clip.startFrame),
                              width: frameToPx(clip.durationFrames),
                            }}
                          />
                        ))
                      )}
                    </WaveformErrorBoundary>
                  )}
                </div>
              </div>

              {highlightRegions.length > 0 &&
                highlightRegions.map((region) => (
                  <div
                    key={region.id}
                    className={`playback-module__highlight-region${selectedHighlightId === region.id ? ' playback-module__highlight-region--selected' : ''}${effectiveSegment != null && !useFullTimeline ? ' playback-module__highlight-region--segment-mode' : ''}`}
                    style={{ left: region.leftPx, width: region.widthPx }}
                    data-highlight-id={region.id}
                    aria-label={`Highlight ${region.ordinal}`}
                  >
                    <span
                      className="playback-module__highlight-handle playback-module__highlight-handle--in"
                      aria-label={`Highlight ${region.ordinal} in point`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingHighlight({ highlightId: region.id, side: 'in' });
                      }}
                    />
                    <span className="playback-module__highlight-ordinal" aria-hidden="true">
                      {region.ordinal}
                    </span>
                    <span
                      className="playback-module__highlight-handle playback-module__highlight-handle--out"
                      aria-label={`Highlight ${region.ordinal} out point`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingHighlight({ highlightId: region.id, side: 'out' });
                      }}
                    />
                  </div>
                ))}
              {highlightRegions.length === 0 && hasInOut && shadeWidthPx != null && shadeLeftPx != null && (
                <div
                  className="playback-module__inout-shade"
                  style={{ left: shadeLeftPx, width: shadeWidthPx }}
                  aria-hidden="true"
                />
              )}
              {highlightRegions.length === 0 && inLeftPx != null && (
                <div
                  className="playback-module__in-marker"
                  style={{ left: inLeftPx }}
                  aria-hidden="true"
                />
              )}
              {highlightRegions.length === 0 && outLeftPx != null && (
                <div
                  className="playback-module__out-marker"
                  style={{ left: outLeftPx }}
                  aria-hidden="true"
                />
              )}
              <div
                className="playback-module__playhead"
                style={{ left: playheadLeftPx }}
                onMouseDown={handlePlayheadMouseDown}
                aria-hidden="true"
                role="slider"
                aria-valuenow={playheadFrame}
                aria-valuemin={0}
                aria-valuemax={durationFrames}
                aria-label="Playhead"
                tabIndex={0}
              >
                <span className="playback-module__playhead-triangle" aria-hidden="true" />
                <span className="playback-module__playhead-line" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
        <div
          className="playback-module__zoom"
          role="group"
          aria-label="Timeline zoom"
          title="Ctrl/Cmd + scroll on timeline to zoom"
        >
          <button
            type="button"
            className="playback-module__zoom-btn"
            onClick={zoomOut}
            aria-label="Zoom out"
          >
            <span className="playback-module__zoom-icon">−</span>
          </button>
          <span className="playback-module__zoom-label" aria-live="polite">
            {Math.round((effectivePixelsPerFrame / DEFAULT_PX_PER_FRAME) * 100)}%
          </span>
          <button
            type="button"
            className="playback-module__zoom-btn"
            onClick={zoomIn}
            aria-label="Zoom in"
          >
            <span className="playback-module__zoom-icon">+</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlaybackModule;
