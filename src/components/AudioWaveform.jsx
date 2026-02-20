import React, { useState, useEffect, useRef, useCallback } from 'react';
import './styles/AudioWaveform.css';

const FLAT_RESULT = Object.freeze({ mins: [], maxs: [] });

/**
 * AudioWaveform — viewport-aware, min/max bar renderer with 1:1 pixel canvas.
 *
 * Layout: outer div is full clip width (keeps scroll area); canvas is sticky-left
 * at viewport width and only renders the visible time window via IPC.
 *
 * Props:
 *   mediaId         — media ID for IPC waveform fetch
 *   startSec        — visible window start (seconds into clip)
 *   endSec          — visible window end (seconds into clip)
 *   totalWidthPx    — full clip width in the timeline (outer container width)
 *   viewportWidthPx — visible viewport width (canvas width, 1:1 pixel)
 *   heightPx        — pixel height
 *   durationSec     — total clip duration
 */
function AudioWaveform({ mediaId, startSec = 0, endSec, totalWidthPx, viewportWidthPx, heightPx, durationSec }) {
  const canvasRef = useRef(null);
  const [waveData, setWaveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchIdRef = useRef(0);

  const outerWidth = Math.max(0, Math.round(Number(totalWidthPx) || 0));
  const canvasWidth = Math.max(0, Math.round(Number(viewportWidthPx) || outerWidth));
  const height = Math.max(0, Math.round(Number(heightPx) || 48));
  const hasMediaId = mediaId != null && mediaId !== '';

  const windowStart = Number(startSec) || 0;
  const windowEnd = Number(endSec) || Number(durationSec) || 0;

  useEffect(() => {
    if (!hasMediaId || canvasWidth <= 0 || windowEnd <= windowStart) {
      setWaveData(null);
      return;
    }

    const api = window.electronAPI?.waveform;
    if (!api?.getWindow) {
      setWaveData(FLAT_RESULT);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);

    api.getWindow(mediaId, windowStart, windowEnd, canvasWidth).then((result) => {
      if (fetchIdRef.current !== id) return;
      if (result?.success && Array.isArray(result.mins) && Array.isArray(result.maxs)) {
        setWaveData({ mins: result.mins, maxs: result.maxs });
      } else {
        setWaveData(FLAT_RESULT);
      }
      setLoading(false);
    }).catch(() => {
      if (fetchIdRef.current !== id) return;
      setWaveData(FLAT_RESULT);
      setLoading(false);
    });
  }, [hasMediaId, mediaId, windowStart, windowEnd, canvasWidth]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveData) return;

    const { mins, maxs } = waveData;
    const colCount = Math.min(mins.length, maxs.length);
    if (colCount === 0) return;

    const w = Math.max(1, canvasWidth);
    const h = Math.max(1, height);

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const root = document.documentElement;
    const getToken = (name) => getComputedStyle(root).getPropertyValue(name).trim();
    const bgColor = getToken('--color-surface-page-surface-default') || getToken('--color-primary-950');
    const waveColor = getToken('--color-blue-400') || getToken('--color-surface-primary-button-surface-default');

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = waveColor;
    const centerY = h / 2;

    for (let x = 0; x < colCount && x < w; x++) {
      const minVal = mins[x];
      const maxVal = maxs[x];

      const topY = Math.round(centerY - maxVal * centerY);
      const botY = Math.round(centerY - minVal * centerY);
      const barH = Math.max(1, botY - topY);

      ctx.fillRect(x, topY, 1, barH);
    }
  }, [waveData, canvasWidth, height]);

  useEffect(() => {
    if (waveData) draw();
  }, [waveData, draw]);

  if (!hasMediaId) return null;

  if (loading && !waveData) {
    return (
      <div
        className="audio-waveform audio-waveform--loading"
        style={{ width: `${outerWidth}px`, height: `${height}px` }}
        aria-hidden="true"
      >
        <span className="audio-waveform__label">Loading…</span>
      </div>
    );
  }

  return (
    <div
      className="audio-waveform"
      style={{ width: `${outerWidth}px`, height: `${height}px` }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="audio-waveform__canvas" />
    </div>
  );
}

export default AudioWaveform;
