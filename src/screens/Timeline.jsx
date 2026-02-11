import React, { useState, useCallback, useEffect } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import TranscriptPanel from '../components/TranscriptPanel';
import PlaybackModule from '../components/PlaybackModule';
import './styles/Timeline.css';

function mediaToSelect(m) {
  if (!m || m.id == null) return null;
  return {
    id: m.id,
    thumbnail: m.thumbnail ?? null,
    clipName: m.clipName || m.name || '',
    highlightCount: 0,
    status: 'pending',
    duration: m.duration != null ? Number(m.duration) : 0,
  };
}

/** Normalize transcript words to lines with { start, end, text } */
function wordsToLines(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  return words.map((w) => ({
    start: Number(w.start) || 0,
    end: Number(w.end) || 0,
    text: typeof w.word === 'string' ? w.word : String(w.word ?? ''),
  }));
}

function Timeline({ project, onBack, onNavigateToTimelineReview }) {
  const [selects, setSelects] = useState([]);
  const [selectedSelectId, setSelectedSelectId] = useState(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState([]);
  useEffect(() => {
    if (!project || typeof project.id === 'undefined' || !window.electronAPI?.media?.getByProject) {
      setSelects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await window.electronAPI.media.getByProject(project.id);
        if (cancelled) return;
        const data = Array.isArray(result?.data) ? result.data : [];
        const valid = data.filter((m) => m != null && m.id != null);
        const mapped = valid.map(mediaToSelect).filter(Boolean);
        setSelects(mapped);
      } catch (err) {
        console.error('Failed to load project media:', err);
        if (!cancelled) setSelects([]);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id]);

  // When selected clip changes: reset time/play, load transcript, derive videoUrl and duration
  useEffect(() => {
    if (!selectedSelectId) {
      setTranscriptLines([]);
      setCurrentTimeSec(0);
      setIsPlaying(false);
      return;
    }
    setCurrentTimeSec(0);
    setIsPlaying(false);
    let cancelled = false;
    (async () => {
      if (!window.electronAPI?.transcription?.getByMediaId) return;
      try {
        const result = await window.electronAPI.transcription.getByMediaId(selectedSelectId);
        if (cancelled) return;
        const data = result?.success ? result.data : null;
        setTranscriptLines(data?.words ? wordsToLines(data.words) : []);
      } catch (err) {
        console.error('Failed to load transcript:', err);
        if (!cancelled) setTranscriptLines([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSelectId]);

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

  const selectsList = Array.isArray(selects) ? selects : [];
  const allDecided = selectsList.length > 0 && selectsList.every((s) => s.status === 'accepted' || s.status === 'deleted');
  const acceptedClips = selectsList.filter((s) => s.status === 'accepted');

  const handleProceedToReviewTimeline = useCallback(() => {
    if (!allDecided || !onNavigateToTimelineReview) return;
    onNavigateToTimelineReview(acceptedClips);
  }, [allDecided, acceptedClips, onNavigateToTimelineReview]);

  const selectedClip = selectsList.find((s) => s.id === selectedSelectId);
  const videoUrl = selectedSelectId ? `media://local/${selectedSelectId}` : null;
  const durationSec = selectedClip?.duration != null ? selectedClip.duration : 0;

  const handleSeek = useCallback((seconds) => {
    setCurrentTimeSec(seconds);
  }, []);

  const handlePlayStateChange = useCallback((playing) => {
    setIsPlaying(playing);
  }, []);

  const handleTimeUpdate = useCallback((seconds) => {
    setCurrentTimeSec(seconds);
  }, []);

  if (!project) {
    return (
      <div className="timeline">
        <ProjectHeader
          projectName="Project"
          onBack={onBack}
          breadcrumbCurrent="Interview Selects"
        />
        <div className="timeline__main timeline__main--placeholder">
          <p className="timeline__placeholder-message">Project not found.</p>
          <button type="button" className="timeline__back-link" onClick={onBack}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  const projectName = project && typeof project === 'object' && project.name != null ? String(project.name) : 'Project';

  return (
    <div className="timeline">
      <ProjectHeader
        projectName={projectName}
        onBack={onBack}
        breadcrumbCurrent="Interview Selects"
      />
      <div className="timeline__main">
        <div className="timeline__transcript-column">
          <TranscriptPanel
            selects={selectsList}
            selectedSelectId={selectedSelectId}
            onSelectClip={setSelectedSelectId}
            onSelectInfo={() => {}}
            onDelete={handleDelete}
            onAccept={handleAccept}
            onProceedToReviewTimeline={handleProceedToReviewTimeline}
            allDecided={allDecided}
            transcript={Array.isArray(transcriptLines) ? transcriptLines : []}
            currentTimeSec={currentTimeSec}
            onSeek={handleSeek}
          />
        </div>
        <div className="timeline__playback-column">
          <PlaybackModule
            videoUrl={videoUrl}
            durationSec={durationSec}
            currentTimeSec={currentTimeSec}
            isPlaying={isPlaying}
            onTimeUpdate={handleTimeUpdate}
            onSeek={handleSeek}
            onPlayStateChange={handlePlayStateChange}
          />
        </div>
      </div>
    </div>
  );
}

export default Timeline;
