import React, { useState, useRef, useCallback, useEffect } from 'react';
import Icon from './Icon';
import AudioWaveform from './AudioWaveform';
import './styles/PlaybackModule.css';

const FPS = 24;
const MIN_PX_PER_FRAME = 0.5;
const MAX_PX_PER_FRAME = 20;
const DEFAULT_PX_PER_FRAME = 2;
/** Minimum horizontal pixels between timecode labels to avoid overlap (larger = fewer labels) */
const MIN_LABEL_SPACING_PX = 160;
/** Nice frame intervals (24 = 1s, 240 = 10s, 1440 = 1min) for round timecode labels */
const NICE_INTERVALS_FRAMES = [1, 6, 12, 24, 48, 120, 240, 480, 720, 1440, 2880];
/** Show frame-level ruler notches when at least this many px per frame (zoom in) */
const FRAME_NOTCHES_MIN_PX_PER_FRAME = 4;

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
}) {
  const isControlled = videoUrl != null && typeof onSeek === 'function';
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [internalPlayheadFrame, setInternalPlayheadFrame] = useState(0);
  const [inPointFrame, setInPointFrame] = useState(null);
  const [outPointFrame, setOutPointFrame] = useState(null);
  const [internalVideoClips] = useState(MOCK_VIDEO_CLIPS);
  const [audioClips] = useState(MOCK_AUDIO_CLIPS);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(DEFAULT_PX_PER_FRAME);

  const videoRef = useRef(null);
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const isDraggingRef = useRef(false);

  const durationSecNum = Number(durationSec);
  const safeDurationSec = Number.isFinite(durationSecNum) && durationSecNum >= 0 ? durationSecNum : 0;
  const durationFrames = isControlled
    ? Math.max(0, Math.round(safeDurationSec * FPS))
    : (Number.isFinite(durationFramesProp) && durationFramesProp >= 0
        ? durationFramesProp
        : (Array.isArray(videoClipsProp) && videoClipsProp.length > 0
            ? videoClipsProp.reduce((sum, c) => sum + (c.durationFrames ?? 0), 0)
            : 2880));
  const currentTimeSecNum = Number(currentTimeSec);
  const safeCurrentTimeSec = Number.isFinite(currentTimeSecNum) && currentTimeSecNum >= 0 ? currentTimeSecNum : 0;
  const playheadFrame = isControlled
    ? Math.max(0, Math.min(durationFrames, Math.round(safeCurrentTimeSec * FPS)))
    : internalPlayheadFrame;
  const isPlayingState = isControlled ? isPlaying : internalPlaying;
  const videoClips = isControlled
    ? (durationFrames > 0 ? [{ id: 'source', startFrame: 0, durationFrames, label: 'Source' }] : [])
    : (Array.isArray(videoClipsProp) && videoClipsProp.length > 0 ? videoClipsProp : internalVideoClips);

  const contentWidthPx = Number.isFinite(durationFrames * pixelsPerFrame)
    ? Math.max(0, durationFrames * pixelsPerFrame)
    : 0;
  const stripWidthPx = 64 + contentWidthPx;
  const waveformWidthPx = Math.min(MAX_CONTENT_WIDTH_PX, contentWidthPx);

  const pxToFrame = useCallback(
    (px) => {
      const f = px / pixelsPerFrame;
      return Math.max(0, Math.min(durationFrames, Math.round(f)));
    },
    [pixelsPerFrame, durationFrames]
  );

  const frameToPx = useCallback((frame) => frame * pixelsPerFrame, [pixelsPerFrame]);

  const getFrameFromClientX = useCallback(
    (clientX) => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return null;
      const rect = content.getBoundingClientRect();
      const x = clientX - rect.left + viewport.scrollLeft;
      return pxToFrame(x);
    },
    [pxToFrame]
  );

  const handleTimelineClick = useCallback(
    (e) => {
      try {
        if (isDraggingRef.current) return;
        if (e.target.closest('.playback-module__playhead')) return;
        const frame = getFrameFromClientX(e.clientX);
        if (frame == null) return;
        if (isControlled && onSeek) {
          onSeek(frame / FPS);
        } else {
          setInternalPlayheadFrame(frame);
        }
      } catch (err) {
        console.error('[PlaybackModule] timeline click error:', err);
      }
    },
    [getFrameFromClientX, isControlled, onSeek]
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
        onSeek(frame / FPS);
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
  }, [getFrameFromClientX, isControlled, onSeek]);

  useEffect(() => {
    if (!isControlled) return;
    const video = videoRef.current;
    if (!video) return;
    const t = Math.max(0, Number(currentTimeSec));
    if (Math.abs(video.currentTime - t) > 0.15) {
      video.currentTime = t;
    }
  }, [currentTimeSec, isControlled]);

  useEffect(() => {
    if (!isControlled) return;
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, isControlled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isControlled || !onTimeUpdate) return;
    const onTimeUpdateEvent = () => {
      onTimeUpdate(video.currentTime);
    };
    video.addEventListener('timeupdate', onTimeUpdateEvent);
    return () => video.removeEventListener('timeupdate', onTimeUpdateEvent);
  }, [isControlled, onTimeUpdate]);

  // High-frequency time updates while playing so transcript word highlight stays in sync
  useEffect(() => {
    if (!isControlled || !isPlayingState || !onTimeUpdate) return;
    const video = videoRef.current;
    if (!video) return;
    let rafId = null;
    const tick = () => {
      if (videoRef.current && !videoRef.current.paused) {
        onTimeUpdate(videoRef.current.currentTime);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [isControlled, isPlayingState, onTimeUpdate]);

  const zoomIn = useCallback(() => {
    setPixelsPerFrame((p) => Math.min(MAX_PX_PER_FRAME, p * 1.5));
  }, []);

  const zoomOut = useCallback(() => {
    setPixelsPerFrame((p) => Math.max(MIN_PX_PER_FRAME, p / 1.5));
  }, []);

  const handleToolbarClick = (id) => {
    if (id === 'play') {
      if (isControlled && onPlayStateChange) {
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
      return;
    }
    if (id === 'clear-in') {
      setInPointFrame(null);
      setOutPointFrame(null);
      return;
    }
    if (id === 'back') {
      const targetFrame = inPointFrame != null ? inPointFrame : 0;
      if (isControlled && onSeek) onSeek(targetFrame / FPS);
      else setInternalPlayheadFrame(targetFrame);
      return;
    }
    if (id === 'forward') {
      const targetFrame = outPointFrame != null ? outPointFrame : durationFrames;
      if (isControlled && onSeek) onSeek(targetFrame / FPS);
      else setInternalPlayheadFrame(targetFrame);
      return;
    }
  };

  const rulerTicks = getRulerTicks(durationFrames, pixelsPerFrame);
  const playheadLeftPx = frameToPx(playheadFrame);
  const inLeftPx = inPointFrame != null ? frameToPx(inPointFrame) : null;
  const outLeftPx = outPointFrame != null ? frameToPx(outPointFrame) : null;
  const hasInOut = inPointFrame != null && outPointFrame != null;
  const shadeLeftPx = hasInOut ? frameToPx(Math.min(inPointFrame, outPointFrame)) : null;
  const shadeWidthPx = hasInOut ? frameToPx(Math.abs(outPointFrame - inPointFrame)) : null;

  const showVideo = isControlled && videoUrl;
  const showPlaceholder = !showVideo;

  return (
    <div className={`playback-module ${className}`.trim()} role="region" aria-label="Playback">
      <div className="playback-module__player-section">
        <div className="playback-module__player">
          {showVideo && (
            <div className="playback-module__player-inner">
              <video
                ref={videoRef}
                className="playback-module__video"
                src={videoUrl}
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
                {isControlled && !videoUrl ? 'Select a clip' : 'Video'}
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
                    state={id === 'play' && isPlaying ? 'selected' : 'primary'}
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
            className="playback-module__timeline-strip"
            style={{ width: stripWidthPx, minWidth: '100%' }}
          >
            <div className="playback-module__timeline-labels">
              <div className="playback-module__ruler-label-spacer" aria-hidden="true" />
              <div className="playback-module__track-label">Video</div>
              <div className="playback-module__track-label">Audio</div>
            </div>
            <div
              className="playback-module__timeline-content"
              ref={contentRef}
              style={{ width: contentWidthPx }}
              onClick={handleTimelineClick}
              role="presentation"
            >
              <div
                className={`playback-module__timeline-ruler${pixelsPerFrame >= FRAME_NOTCHES_MIN_PX_PER_FRAME ? ' playback-module__timeline-ruler--frame-notches' : ''}`}
                style={{
                  '--ruler-notch-major-step-px': `${24 * pixelsPerFrame}px`,
                  '--ruler-notch-medium-step-px': `${6 * pixelsPerFrame}px`,
                  '--ruler-notch-minor-step-px': `${pixelsPerFrame}px`,
                  '--ruler-notch-major-height': 'var(--spacing-md)',
                  '--ruler-notch-medium-height': 'var(--spacing-sm)',
                  '--ruler-notch-minor-height': 'var(--spacing-xs)',
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
              <div className="playback-module__track playback-module__track--video">
                <div className="playback-module__track-content">
                  {videoClips.map((clip) => (
                    <div
                      key={clip.id}
                      className="playback-module__clip playback-module__clip--video"
                      style={{
                        left: frameToPx(clip.startFrame),
                        width: frameToPx(clip.durationFrames),
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="playback-module__track playback-module__track--audio">
                <div className="playback-module__track-content">
                  <WaveformErrorBoundary fallbackStyle={{ width: waveformWidthPx, height: 48 }}>
                    {showVideo && videoUrl ? (
                      <AudioWaveform
                        mediaId={selectedMediaId}
                        videoUrl={videoUrl}
                        preloadedPeaks={preloadedWaveform?.peaks}
                        widthPx={waveformWidthPx}
                        heightPx={48}
                        durationSec={safeDurationSec}
                      />
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
                </div>
              </div>

              {hasInOut && shadeWidthPx != null && shadeLeftPx != null && (
                <div
                  className="playback-module__inout-shade"
                  style={{ left: shadeLeftPx, width: shadeWidthPx }}
                  aria-hidden="true"
                />
              )}
              {inLeftPx != null && (
                <div
                  className="playback-module__in-marker"
                  style={{ left: inLeftPx }}
                  aria-hidden="true"
                />
              )}
              {outLeftPx != null && (
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
        <div className="playback-module__zoom" role="group" aria-label="Timeline zoom">
          <button
            type="button"
            className="playback-module__zoom-btn"
            onClick={zoomOut}
            aria-label="Zoom out"
          >
            <span className="playback-module__zoom-icon">−</span>
          </button>
          <span className="playback-module__zoom-label" aria-live="polite">
            {Math.round((pixelsPerFrame / DEFAULT_PX_PER_FRAME) * 100)}%
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
