import React, { useState, useCallback, useEffect } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import TranscriptPanel from '../components/TranscriptPanel';
import PlaybackModule from '../components/PlaybackModule';
import './styles/Timeline.css';

function mediaToSelect(m) {
  return {
    id: m.id,
    thumbnail: m.thumbnail ?? null,
    clipName: m.clipName || m.name || '',
    highlightCount: 0,
    status: 'pending',
  };
}

function Timeline({ project, onBack, onNavigateToTimelineReview }) {
  const [selects, setSelects] = useState([]);
  const [selectedSelectId, setSelectedSelectId] = useState(null);

  useEffect(() => {
    if (!project || !window.electronAPI?.media?.getByProject) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await window.electronAPI.media.getByProject(project.id);
        if (cancelled || !result.success) return;
        const data = result.data ?? [];
        setSelects(data.map(mediaToSelect));
      } catch (err) {
        console.error('Failed to load project media:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id]);

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
