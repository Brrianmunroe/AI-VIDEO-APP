import React, { useState, useEffect, useRef, useCallback } from 'react';
import './styles/AudioWaveform.css';

const FLAT_RESULT = Object.freeze({ mins: [], maxs: [] });

/** Max canvas width per tile — safely under Chromium's ~16,384px GPU limit. */
const TILE_WIDTH = 4096;

/**
 * WaveformTile — self-contained canvas that fetches and renders one slice of
 * the waveform. Each tile calls getWindow() for its own time range and pixel width.
 */
const WaveformTile = React.memo(function WaveformTile({ mediaId, startSec, endSec, widthPx, heightPx }) {
  const canvasRef = useRef(null);
  const [waveData, setWaveData] = useState(null);
  const fetchIdRef = useRef(0);

  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx));

  useEffect(() => {
    if (!mediaId || w <= 0 || endSec <= startSec) {
      setWaveData(null);
      return;
    }
    const api = window.electronAPI?.waveform;
    if (!api?.getWindow) {
      setWaveData(FLAT_RESULT);
      return;
    }
    const id = ++fetchIdRef.current;
    api.getWindow(mediaId, startSec, endSec, w).then((result) => {
      if (fetchIdRef.current !== id) return;
      if (result?.success && Array.isArray(result.mins) && Array.isArray(result.maxs)) {
        setWaveData({ mins: result.mins, maxs: result.maxs });
      } else {
        setWaveData(FLAT_RESULT);
      }
    }).catch(() => {
      if (fetchIdRef.current !== id) return;
      setWaveData(FLAT_RESULT);
    });
  }, [mediaId, startSec, endSec, w]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveData) return;

    const { mins, maxs } = waveData;
    const colCount = Math.min(mins.length, maxs.length);
    if (colCount === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const drawW = w;
    const drawH = h;
    canvas.width = Math.round(drawW * dpr);
    canvas.height = Math.round(drawH * dpr);
    canvas.style.width = drawW + 'px';
    canvas.style.height = drawH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const root = document.documentElement;
    const getToken = (name) => getComputedStyle(root).getPropertyValue(name).trim();
    const bgColor = getToken('--color-surface-page-surface-default') || getToken('--color-primary-950');
    const waveColor = getToken('--color-blue-400') || getToken('--color-surface-primary-button-surface-default');

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, drawW, drawH);

    ctx.fillStyle = waveColor;
    const padding = 2;
    const strokeWidth = 1;
    const midY = drawH / 2;
    const yMin = padding + strokeWidth / 2;
    const yMax = drawH - padding - strokeWidth / 2;
    const drawableH = yMax - yMin;

    // Compute data range; scale so full range maps to [yMin, yMax] and center data (no per-bar clamp)
    let dataMin = 1, dataMax = -1;
    for (let i = 0; i < colCount; i++) {
      if (mins[i] < dataMin) dataMin = mins[i];
      if (maxs[i] > dataMax) dataMax = maxs[i];
    }
    const dataRange = dataMax - dataMin;
    const dataCenter = (dataMin + dataMax) / 2;
    const scale = dataRange > 1e-9 ? drawableH / dataRange : 0;

    const colStep = colCount <= drawW ? 1 : colCount / Math.max(1, drawW);
    for (let px = 0; px < drawW; px++) {
      const xi = Math.min(Math.floor(px * colStep), colCount - 1);
      const minVal = mins[xi];
      const maxVal = maxs[xi];
      const topY = Math.round(midY - (maxVal - dataCenter) * scale);
      const botY = Math.round(midY - (minVal - dataCenter) * scale);
      const barH = Math.max(1, botY - topY);
      ctx.fillRect(Math.round(px), topY, Math.max(1, Math.ceil(colStep)), barH);
    }

  }, [waveData, w, h]);

  useEffect(() => {
    if (waveData) draw();
  }, [waveData, draw]);

  return (
    <canvas
      ref={canvasRef}
      className="audio-waveform__tile"
      width={w}
      height={h}
      style={{ width: w, height: h }}
    />
  );
});

/**
 * AudioWaveform — tiled waveform renderer.
 *
 * Splits the full clip width into canvas tiles of TILE_WIDTH px each.
 * Each tile independently fetches its slice of audio data via IPC and
 * renders min/max bars. Together the tiles span the full clip width
 * and scroll naturally with the timeline.
 *
 * Props:
 *   mediaId      — media ID for IPC waveform fetch
 *   startSec     — start of the audio range to render (seconds)
 *   endSec       — end of the audio range to render (seconds)
 *   totalWidthPx — full clip width in the timeline (outer container width)
 *   heightPx     — pixel height
 *   durationSec  — total clip duration (fallback for endSec)
 */
function AudioWaveform({ mediaId, startSec = 0, endSec, totalWidthPx, heightPx, durationSec }) {
  const width = Math.max(0, Math.round(Number(totalWidthPx) || 0));
  const height = Math.max(0, Math.round(Number(heightPx) || 48));
  const hasMediaId = mediaId != null && mediaId !== '';

  const windowStart = Number(startSec) || 0;
  const windowEnd = Number(endSec) || Number(durationSec) || 0;

  if (!hasMediaId || width <= 0) return null;

  const tileCount = Math.max(1, Math.ceil(width / TILE_WIDTH));
  const rangeSec = windowEnd - windowStart;

  return (
    <div
      className="audio-waveform"
      style={{ width: `${width}px`, minWidth: `${width}px`, height: `${height}px` }}
      aria-hidden="true"
    >
      {Array.from({ length: tileCount }, (_, i) => {
        const tilePx = Math.min(TILE_WIDTH, width - i * TILE_WIDTH);
        const tStart = windowStart + (i * TILE_WIDTH / width) * rangeSec;
        const tEnd = windowStart + ((i * TILE_WIDTH + tilePx) / width) * rangeSec;
        return (
          <WaveformTile
            key={i}
            mediaId={mediaId}
            startSec={tStart}
            endSec={tEnd}
            widthPx={tilePx}
            heightPx={height}
          />
        );
      })}
    </div>
  );
}

export default AudioWaveform;
