import React, { useState, useEffect, useRef, useCallback } from 'react';
import './styles/AudioWaveform.css';

const MAX_PEAKS = 2000;
/** Browser/GPU canvas limits; exceeding can crash the renderer. Use capped size and CSS scale. */
const MAX_CANVAS_WIDTH = 8192;
const MAX_CANVAS_HEIGHT = 4096;

/** Flat peaks for no-audio / error: same bar count as normal waveform, all zero → draws a flat line. */
const FLAT_PEAKS = Object.freeze(Array.from({ length: 1500 }, () => 0));

/**
 * Compute peak values from decoded AudioBuffer (time-based, capped at MAX_PEAKS).
 * Returns array of values in [0, 1].
 */
function computePeaks(buffer) {
  const channel = 0;
  const channelData = buffer.getChannelData(channel);
  const length = channelData.length;
  if (length === 0) return [];

  const numBars = Math.min(MAX_PEAKS, length);
  const step = length / numBars;
  const peaks = [];

  for (let i = 0; i < numBars; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(length, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }

  return peaks;
}

function isSilent(peaks) {
  return peaks.length === 0 || peaks.every((p) => p < 1e-6);
}

function AudioWaveform({ mediaId, videoUrl, preloadedPeaks, widthPx, heightPx, durationSec }) {
  const hasPreloaded = Array.isArray(preloadedPeaks) && preloadedPeaks.length > 0;
  const [peaks, setPeaks] = useState(() => (hasPreloaded ? preloadedPeaks : null));
  const [loading, setLoading] = useState(!hasPreloaded && (mediaId != null && mediaId !== ''));
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(hasPreloaded && preloadedPeaks.every((p) => p < 1e-6));
  const canvasRef = useRef(null);
  const mediaIdRef = useRef(mediaId);
  const videoUrlRef = useRef(videoUrl);
  const abortRef = useRef(null);

  const width = Math.max(0, Math.round(Number(widthPx) || 0));
  const height = Math.max(0, Math.round(Number(heightPx) || 48));
  const hasMediaId = mediaId != null && mediaId !== '';
  const hasUrl = Boolean(videoUrl);
  const hasInput = hasMediaId || hasUrl;

  // When preloadedPeaks is provided for this clip, use them immediately (no loading, no IPC)
  useEffect(() => {
    if (!hasMediaId) return;
    if (Array.isArray(preloadedPeaks) && preloadedPeaks.length > 0) {
      const isSilent = preloadedPeaks.every((p) => p < 1e-6);
      setPeaks(isSilent ? FLAT_PEAKS : preloadedPeaks);
      setLoading(false);
      setError(false);
      setEmpty(false);
      return;
    }
    if (Array.isArray(preloadedPeaks) && preloadedPeaks.length === 0) {
      setPeaks(FLAT_PEAKS);
      setLoading(false);
      setError(false);
      setEmpty(false);
      return;
    }
  }, [mediaId, hasMediaId, preloadedPeaks]);

  // When mediaId is present and no preloaded peaks: load peaks via IPC (main process FFmpeg)
  useEffect(() => {
    if (!hasMediaId) return;
    if (Array.isArray(preloadedPeaks)) return;

    const currentMediaId = mediaId;
    mediaIdRef.current = currentMediaId;
    setPeaks(null);
    setError(false);
    setEmpty(false);
    setLoading(true);

    const api = window.electronAPI?.waveform;
    if (!api?.getPeaks) {
      setPeaks(FLAT_PEAKS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    api.getPeaks(currentMediaId).then((result) => {
      if (cancelled || mediaIdRef.current !== currentMediaId) return;
      if (result?.success && Array.isArray(result.peaks)) {
        if (result.peaks.length === 0 || result.peaks.every((p) => p < 1e-6)) {
          setPeaks(FLAT_PEAKS);
        } else {
          setPeaks(result.peaks);
        }
      } else {
        setPeaks(FLAT_PEAKS);
      }
      setLoading(false);
      setError(false);
      setEmpty(false);
    }).catch((err) => {
      if (cancelled || mediaIdRef.current !== currentMediaId) return;
      console.warn('[AudioWaveform] getPeaks failed:', err?.message || err);
      setPeaks(FLAT_PEAKS);
      setLoading(false);
      setError(false);
      setEmpty(false);
    });

    return () => {
      cancelled = true;
      mediaIdRef.current = currentMediaId;
    };
  }, [mediaId, hasMediaId, preloadedPeaks]);

  // When only videoUrl (no mediaId): legacy fetch + decode path
  useEffect(() => {
    if (hasMediaId || !hasUrl) {
      if (!hasMediaId) {
        setPeaks(null);
        setLoading(false);
        setError(false);
        setEmpty(false);
        videoUrlRef.current = null;
      }
      return;
    }

    videoUrlRef.current = videoUrl;
    setPeaks(null);
    setError(false);
    setEmpty(false);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const response = await fetch(videoUrl, { signal: controller.signal });
        if (!response.ok) throw new Error('Fetch failed');
        const arrayBuffer = await response.arrayBuffer();
        if (videoUrlRef.current !== videoUrl) return;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        if (videoUrlRef.current !== videoUrl) return;

        const computedPeaks = computePeaks(decoded);
        if (videoUrlRef.current !== videoUrl) return;

        if (isSilent(computedPeaks)) {
          setPeaks(FLAT_PEAKS);
        } else {
          setPeaks(computedPeaks);
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (videoUrlRef.current !== videoUrl) return;
        console.warn('[AudioWaveform] load/decode failed:', e.message || e);
        setPeaks(FLAT_PEAKS);
      } finally {
        if (videoUrlRef.current === videoUrl) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [videoUrl, hasUrl, hasMediaId]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;

    try {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const displayW = Math.max(0, Math.round(width));
      const displayH = Math.max(0, Math.round(height));
      if (displayW === 0 || displayH === 0) return;

      const drawW = Math.min(displayW, MAX_CANVAS_WIDTH);
      const drawH = Math.min(displayH, MAX_CANVAS_HEIGHT);

      canvas.width = Math.floor(drawW * dpr);
      canvas.height = Math.floor(drawH * dpr);
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);

      const fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-700').trim() || '#0A6084';
      ctx.fillStyle = fillStyle;

      const centerY = drawH / 2;
      const halfHeight = Math.max(1, (drawH / 2) - 2);
      const barCount = peaks.length;
      const maxPeak = Math.max(...peaks, 1e-6);

      for (let i = 0; i < barCount; i++) {
        const x = (i / barCount) * drawW;
        const barWidth = Math.max(0.5, (drawW / barCount) - 0.5);
        const norm = peaks[i] / maxPeak;
        const barHeight = Math.max(1, norm * halfHeight);
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
      }
    } catch (err) {
      console.error('[AudioWaveform] draw error:', err);
    }
  }, [peaks, width, height]);

  useEffect(() => {
    if (!peaks || peaks.length === 0) return;
    draw();
  }, [peaks, width, height, draw]);

  if (!hasInput) {
    return null;
  }

  if (loading) {
    return (
      <div
        className="audio-waveform audio-waveform--loading"
        style={{ width: `${width}px`, height: `${height}px` }}
        aria-hidden="true"
      >
        <span className="audio-waveform__label">Loading…</span>
      </div>
    );
  }

  return (
    <div
      className="audio-waveform"
      style={{ width: `${width}px`, height: `${height}px` }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="audio-waveform__canvas" width={width} height={height} />
    </div>
  );
}

export default AudioWaveform;
