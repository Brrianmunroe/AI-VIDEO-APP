import React, { useMemo, useCallback, useState, useEffect } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import PlaybackModule from '../components/PlaybackModule';
import Button from '../components/Button';
import ExportTimelineModal from '../components/ExportTimelineModal';
import './styles/TimelineReview.css';

const FPS = 24;

/** Recompute startFrame for each segment in order and return total duration in frames. */
function applyRipple(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { segments: [], durationFrames: 0 };
  }
  let startFrame = 0;
  const out = segments.map((seg) => {
    const durationFrames = seg.durationFrames ?? Math.max(0, Math.round((Number(seg.sourceOutSec) - Number(seg.sourceInSec)) * FPS));
    const next = { ...seg, startFrame, durationFrames };
    startFrame += durationFrames;
    return next;
  });
  return { segments: out, durationFrames: startFrame };
}

function buildTimelineFromAccepted(acceptedClips) {
  if (!acceptedClips || acceptedClips.length === 0) {
    return { videoClips: [], durationFrames: 0 };
  }
  let startFrame = 0;
  const videoClips = [];

  for (const c of acceptedClips) {
    const highlights = Array.isArray(c.highlights) ? c.highlights : [];
    if (highlights.length === 0) {
      continue;
    }
    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      const inSec = Math.max(0, Number(h.in) || 0);
      const outSec = Math.max(inSec, Number(h.out) || 0);
      const durationFrames = Math.max(0, Math.round((outSec - inSec) * FPS));
      videoClips.push({
        id: `${c.id}_h${i}`,
        sourceMediaId: c.id,
        startFrame,
        durationFrames,
        label: `${c.clipName || `Clip ${c.id}`} (${i + 1})`,
        sourceInSec: inSec,
        sourceOutSec: outSec,
      });
      startFrame += durationFrames;
    }
  }
  return { videoClips, durationFrames: startFrame };
}

function TimelineReview({ project, onBack, acceptedClips = [] }) {
  const initial = useMemo(
    () => buildTimelineFromAccepted(acceptedClips),
    [acceptedClips]
  );

  const [segments, setSegments] = useState([]);

  useEffect(() => {
    setSegments(initial.videoClips);
  }, [acceptedClips]);

  const { segments: rippledSegments, durationFrames } = useMemo(
    () => applyRipple(segments),
    [segments]
  );

  const mediaDurationById = useMemo(
    () => Object.fromEntries((acceptedClips || []).map((c) => [c.id, c.duration])),
    [acceptedClips]
  );

  const [waveformByMediaId, setWaveformByMediaId] = useState({});
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);

  const uniqueMediaIds = useMemo(
    () => Array.from(new Set((acceptedClips || []).map((c) => c.id).filter(Boolean))),
    [acceptedClips]
  );

  useEffect(() => {
    if (!window.electronAPI?.waveform?.getPeaks || uniqueMediaIds.length === 0) return;
    setWaveformByMediaId({});
    let cancelled = false;
    uniqueMediaIds.forEach((mediaId) => {
      window.electronAPI.waveform.getPeaks(mediaId).then((result) => {
        if (cancelled) return;
        if (result?.success && Array.isArray(result.peaks)) {
          const durationSec = result.durationSec ?? 0;
          setWaveformByMediaId((prev) => ({
            ...prev,
            [mediaId]: { peaks: result.peaks, durationSec },
          }));
        }
      }).catch(() => { /* ignore per-clip failures */ });
    });
    return () => { cancelled = true; };
  }, [uniqueMediaIds.join(',')]);

  const handleSegmentTrim = useCallback((segmentId, { sourceInSec, sourceOutSec }) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.id === segmentId
          ? { ...seg, sourceInSec, sourceOutSec }
          : seg
      )
    );
  }, []);

  const handleDeleteSegment = useCallback(() => {
    if (!selectedSegmentId) return;
    setSegments((prev) => prev.filter((seg) => seg.id !== selectedSegmentId));
    setSelectedSegmentId(null);
  }, [selectedSegmentId]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSegmentId) {
        e.preventDefault();
        handleDeleteSegment();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSegmentId, handleDeleteSegment]);

  const handleSplitAtPlayhead = useCallback((playheadFrame) => {
    const { segments: withFrames } = applyRipple(segments);
    const idx = withFrames.findIndex(
      (seg) =>
        playheadFrame >= seg.startFrame &&
        playheadFrame < seg.startFrame + (seg.durationFrames ?? 0)
    );
    if (idx < 0) return;
    const seg = withFrames[idx];
    const inSec = Number(seg.sourceInSec) || 0;
    const outSec = Number(seg.sourceOutSec) || 0;
    const splitOffsetSec = (playheadFrame - seg.startFrame) / FPS;
    const splitSec = Math.max(inSec, Math.min(outSec - 0.05, inSec + splitOffsetSec));
    setSegments((prev) => {
      const raw = prev[idx];
      const segA = { ...raw, sourceOutSec: splitSec };
      const segB = { ...raw, id: `${raw.id}_split_${Date.now()}`, sourceInSec: splitSec };
      return [...prev.slice(0, idx), segA, segB, ...prev.slice(idx + 1)];
    });
  }, [segments]);

  const handleExportToTimeline = useCallback(() => {
    setExportModalOpen(true);
  }, []);

  const handleExportConfirm = useCallback(async (platform, payload) => {
    setExportMessage(null);
    if (platform !== 'premiere') return;
    const api = window.electronAPI?.export;
    if (!api?.exportFCPXMLPackage) {
      setExportMessage({ type: 'error', error: 'Export not available' });
      return;
    }
    try {
      const result = await api.exportFCPXMLPackage(project?.id, payload, project?.name);
      if (result?.canceled) return;
      if (result?.success && result?.path) {
        setExportMessage({ type: 'success', path: result.path });
      } else {
        setExportMessage({ type: 'error', error: result?.error || 'Export failed' });
      }
    } catch (err) {
      setExportMessage({ type: 'error', error: err?.message || String(err) });
    }
  }, [project?.id, project?.name]);

  const handleOpenExportFolder = useCallback(() => {
    if (exportMessage?.type === 'success' && exportMessage?.path && window.electronAPI?.export?.openFolder) {
      window.electronAPI.export.openFolder(exportMessage.path);
    }
  }, [exportMessage]);

  return (
    <div className="timeline-review">
      <ProjectHeader
        projectName={project?.name || 'Project'}
        onBack={onBack}
        breadcrumbCurrent="Timeline Review"
      />
      {exportMessage && (
        <div
          className={`timeline-review__export-banner timeline-review__export-banner--${exportMessage.type}`}
          role="status"
        >
          {exportMessage.type === 'success' ? (
            <>
              <span className="timeline-review__export-banner-text">
                Package saved. In Premiere: File → Import… and select Timeline.xml in that folder.
              </span>
              <Button variant="secondary" onClick={handleOpenExportFolder}>
                Open folder
              </Button>
            </>
          ) : (
            <>
              <span className="timeline-review__export-banner-text">
                {exportMessage.error}
              </span>
            </>
          )}
          <button
            type="button"
            className="timeline-review__export-banner-dismiss"
            onClick={() => setExportMessage(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div className="timeline-review__main">
        <PlaybackModule
          className="timeline-review__playback"
          videoClips={rippledSegments}
          durationFrames={durationFrames}
          editableTimeline={true}
          onSegmentTrim={handleSegmentTrim}
          mediaDurationById={mediaDurationById}
          preloadedWaveformByMediaId={waveformByMediaId}
          selectedSegmentId={selectedSegmentId}
          onSelectSegment={setSelectedSegmentId}
          onSplitAtPlayhead={handleSplitAtPlayhead}
          toolbarExtra={
            <Button variant="primary" onClick={handleExportToTimeline}>
              Export to timeline
            </Button>
          }
        />
      </div>
      <ExportTimelineModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportConfirm}
        videoClips={rippledSegments}
        durationFrames={durationFrames}
      />
    </div>
  );
}

export default TimelineReview;
