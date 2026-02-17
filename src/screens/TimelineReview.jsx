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

  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);

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

  const handleExportConfirm = useCallback((platform, payload) => {
    // Placeholder: wire to actual export (e.g. EDL for Premiere) when implemented
    console.log('Export timeline', { platform, ...payload });
  }, []);

  return (
    <div className="timeline-review">
      <ProjectHeader
        projectName={project?.name || 'Project'}
        onBack={onBack}
        breadcrumbCurrent="Timeline Review"
      />
      <div className="timeline-review__main">
        <PlaybackModule
          className="timeline-review__playback"
          videoClips={rippledSegments}
          durationFrames={durationFrames}
          editableTimeline={true}
          onSegmentTrim={handleSegmentTrim}
          mediaDurationById={mediaDurationById}
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
