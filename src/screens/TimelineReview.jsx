import React, { useMemo } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import PlaybackModule from '../components/PlaybackModule';
import './styles/TimelineReview.css';

function buildTimelineFromAccepted(acceptedClips) {
  if (!acceptedClips || acceptedClips.length === 0) {
    return { videoClips: [], durationFrames: 0 };
  }
  let startFrame = 0;
  const videoClips = acceptedClips.map((c) => {
    const durationFrames = c.durationFrames ?? 480;
    const clip = {
      id: c.id,
      startFrame,
      durationFrames,
      label: c.clipName || `Clip ${c.id}`,
    };
    startFrame += durationFrames;
    return clip;
  });
  return { videoClips, durationFrames: startFrame };
}

function TimelineReview({ project, onBack, acceptedClips = [] }) {
  const { videoClips, durationFrames } = useMemo(
    () => buildTimelineFromAccepted(acceptedClips),
    [acceptedClips]
  );

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
        />
      </div>
    </div>
  );
}

export default TimelineReview;
