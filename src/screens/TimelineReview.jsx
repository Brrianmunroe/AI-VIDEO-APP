import React, { useMemo, useCallback, useState } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import PlaybackModule from '../components/PlaybackModule';
import Button from '../components/Button';
import ExportTimelineModal from '../components/ExportTimelineModal';
import './styles/TimelineReview.css';

const FPS = 24;

function buildTimelineFromAccepted(acceptedClips) {
  if (!acceptedClips || acceptedClips.length === 0) {
    return { videoClips: [], durationFrames: 0 };
  }
  let startFrame = 0;
  const videoClips = [];
  const fullClipDurationFrames = (c) =>
    c.durationFrames ??
    (c.duration != null ? Math.max(0, Math.round(Number(c.duration) * FPS)) : 480);

  for (const c of acceptedClips) {
    const highlights = Array.isArray(c.highlights) ? c.highlights : [];
    if (highlights.length === 0) {
      const durationFrames = fullClipDurationFrames(c);
      videoClips.push({
        id: c.id,
        startFrame,
        durationFrames,
        label: c.clipName || `Clip ${c.id}`,
        sourceInSec: 0,
        sourceOutSec: c.duration != null ? Number(c.duration) : durationFrames / FPS,
      });
      startFrame += durationFrames;
    } else {
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
  }
  return { videoClips, durationFrames: startFrame };
}

function TimelineReview({ project, onBack, acceptedClips = [] }) {
  const { videoClips, durationFrames } = useMemo(
    () => buildTimelineFromAccepted(acceptedClips),
    [acceptedClips]
  );

  const [exportModalOpen, setExportModalOpen] = useState(false);

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
          videoClips={videoClips}
          durationFrames={durationFrames}
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
        videoClips={videoClips}
        durationFrames={durationFrames}
      />
    </div>
  );
}

export default TimelineReview;
