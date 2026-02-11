import React, { useState, useCallback } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import TranscriptPanel from '../components/TranscriptPanel';
import PlaybackModule from '../components/PlaybackModule';
import './styles/Timeline.css';

/** Mock AI-cut selects; each gets status pending | accepted | deleted */
const INITIAL_SELECTS = [
  { id: '1', thumbnail: 'https://picsum.photos/seed/clip1/320/180', clipName: 'clip_0001.mp4', highlightCount: 3, durationFrames: 480 },
  { id: '2', thumbnail: 'https://picsum.photos/seed/clip2/320/180', clipName: 'clip_0002.mp4', highlightCount: 5, durationFrames: 360 },
  { id: '3', thumbnail: 'https://picsum.photos/seed/clip3/320/180', clipName: 'clip_0003.mp4', highlightCount: 2, durationFrames: 420 },
  { id: '4', thumbnail: 'https://picsum.photos/seed/clip4/320/180', clipName: 'clip_0004.mp4', highlightCount: 4, durationFrames: 300 },
  { id: '5', thumbnail: 'https://picsum.photos/seed/clip5/320/180', clipName: 'clip_0005.mp4', highlightCount: 1, durationFrames: 480 },
];

function Timeline({ project, onBack, onNavigateToTimelineReview }) {
  const [selects, setSelects] = useState(() =>
    INITIAL_SELECTS.map((s) => ({ ...s, status: 'pending' }))
  );
  const [selectedSelectId, setSelectedSelectId] = useState(null);

  const handleAccept = useCallback((clipId) => {
    setSelects((prev) =>
      prev.map((s) => (s.id === clipId ? { ...s, status: 'accepted' } : s))
    );
  }, []);

  const handleDelete = useCallback((clipId) => {
    setSelects((prev) =>
      prev.map((s) => (s.id === clipId ? { ...s, status: 'deleted' } : s))
    );
    setSelectedSelectId((id) => (id === clipId ? null : id));
  }, []);

  const allDecided = selects.every((s) => s.status === 'accepted' || s.status === 'deleted');
  const acceptedClips = selects.filter((s) => s.status === 'accepted');

  const handleProceedToReviewTimeline = useCallback(() => {
    if (!allDecided || !onNavigateToTimelineReview) return;
    onNavigateToTimelineReview(acceptedClips);
  }, [allDecided, acceptedClips, onNavigateToTimelineReview]);

  return (
    <div className="timeline">
      <ProjectHeader
        projectName={project?.name || 'Project'}
        onBack={onBack}
        breadcrumbCurrent="Interview Selects"
      />
      <div className="timeline__main">
        <div className="timeline__transcript-column">
          <TranscriptPanel
            selects={selects}
            selectedSelectId={selectedSelectId}
            onSelectClip={setSelectedSelectId}
            onSelectInfo={() => {}}
            onDelete={handleDelete}
            onAccept={handleAccept}
            onProceedToReviewTimeline={handleProceedToReviewTimeline}
            allDecided={allDecided}
          />
        </div>
        <div className="timeline__playback-column">
          <PlaybackModule />
        </div>
      </div>
    </div>
  );
}

export default Timeline;
