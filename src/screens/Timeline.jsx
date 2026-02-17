import React, { useState, useCallback, useEffect, useRef } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import TranscriptPanel from '../components/TranscriptPanel';
import PlaybackModule from '../components/PlaybackModule';
import Button from '../components/Button';
import './styles/Timeline.css';

/** Generate a unique id for a highlight (e.g. for React keys and updates). */
function generateHighlightId() {
  return `highlight_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Normalize highlights: sort by in, ensure in < out, clamp to [0, duration]. */
function normalizeHighlights(highlights, durationSec) {
  if (!Array.isArray(highlights) || highlights.length === 0) return [];
  const dur = Number.isFinite(durationSec) && durationSec >= 0 ? durationSec : 86400;
  return highlights
    .filter((h) => h != null && typeof h.id === 'string')
    .map((h) => ({
      id: h.id,
      in: Math.max(0, Math.min(dur, Number(h.in) || 0)),
      out: Math.max(0, Math.min(dur, Number(h.out) || 0)),
    }))
    .filter((h) => h.out > h.in)
    .sort((a, b) => a.in - b.in);
}

function mediaToSelect(m) {
  if (!m || m.id == null) return null;
  const duration = m.duration != null ? Number(m.duration) : 0;
  const rawHighlights = Array.isArray(m.highlights) ? m.highlights : [];
  const highlights = rawHighlights.length
    ? rawHighlights.map((h) => ({
        id: h.id != null ? String(h.id) : generateHighlightId(),
        in: Number(h.in) || 0,
        out: Number(h.out) || 0,
      }))
    : [];
  return {
    id: m.id,
    thumbnail: m.thumbnail ?? null,
    clipName: m.clipName || m.name || '',
    highlightCount: highlights.length,
    status: m.status || 'pending',
    duration,
    highlights: normalizeHighlights(highlights, duration),
  };
}

/** Normalize segment-level words to lines with { start, end, text } (no .words) */
function wordsToLines(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  return words.map((w) => ({
    start: Number(w.start) || 0,
    end: Number(w.end) || 0,
    text: typeof w.word === 'string' ? w.word : String(w.word ?? ''),
  }));
}

const LINE_GAP_THRESHOLD_SEC = 0.5;
/** Max words per line when there's no punctuation or long pause (phrase-length chunks). */
const MAX_WORDS_PER_LINE = 14;

/** True if word (after trim) ends with sentence-ending punctuation. */
function wordEndsSentence(word) {
  if (word == null || typeof word !== 'string') return false;
  const t = word.trim();
  return t.length > 0 && /[.!?]$/.test(t);
}

/**
 * Build transcript lines from API words. If data is word-level (many single-word items),
 * group by sentence end, time gap, or max words per line; attach .words per line. Else segment-level.
 */
function buildTranscriptLines(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const normalized = words.map((w) => ({
    word: typeof w.word === 'string' ? w.word : String(w.word ?? ''),
    start: Number(w.start) || 0,
    end: Number(w.end) || 0,
  }));
  const trimmedSingleWord = (w) => !/\s/.test((w.word || '').trim()) && (w.word || '').trim().length > 0;
  const noSpaces = normalized.filter(trimmedSingleWord).length;
  const isWordLevel = normalized.length > 8 && noSpaces / normalized.length >= 0.85;
  if (!isWordLevel) return wordsToLines(normalized);
  const lines = [];
  let lineWords = [normalized[0]];
  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1];
    const curr = normalized[i];
    const gap = curr.start - prev.end;
    const prevEndsSentence = wordEndsSentence(prev.word);
    const atMaxWords = lineWords.length >= MAX_WORDS_PER_LINE;
    const shouldBreak =
      (prevEndsSentence || gap > LINE_GAP_THRESHOLD_SEC || atMaxWords) && lineWords.length > 0;
    if (shouldBreak) {
      const first = lineWords[0];
      const last = lineWords[lineWords.length - 1];
      lines.push({
        start: first.start,
        end: last.end,
        text: lineWords.map((w) => w.word).join(' '),
        words: lineWords,
      });
      lineWords = [];
    }
    lineWords.push(curr);
  }
  if (lineWords.length > 0) {
    const first = lineWords[0];
    const last = lineWords[lineWords.length - 1];
    lines.push({
      start: first.start,
      end: last.end,
      text: lineWords.map((w) => w.word).join(' '),
      words: lineWords,
    });
  }
  return lines;
}

function Timeline({ project, onBack, onNavigateToTimelineReview }) {
  const [selects, setSelects] = useState([]);
  const [selectedSelectId, setSelectedSelectId] = useState(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState([]);
  const [transcriptEmptyReason, setTranscriptEmptyReason] = useState(null);
  const [transcriptionErrors, setTranscriptionErrors] = useState([]);
  const [waveformCache, setWaveformCache] = useState({});
  const selectedSelectIdRef = useRef(null);
  const transcriptionStartedForProjectIdRef = useRef(null);
  const transcriptionInProgressRef = useRef(false);
  const persistHighlightsTimeoutRef = useRef(null);

  const selectsList = Array.isArray(selects) ? selects : [];

  useEffect(() => {
    selectedSelectIdRef.current = selectedSelectId;
  }, [selectedSelectId]);

  // Pre-load waveform peaks for all project clips so the waveform is ready when a clip is selected
  const waveformCacheProjectIdRef = useRef(null);
  const selectIdsKey = selectsList.filter((s) => s?.id != null).map((s) => s.id).join(',');
  useEffect(() => {
    if (!project?.id || !window.electronAPI?.waveform?.getPeaks) return;
    if (waveformCacheProjectIdRef.current !== project.id) {
      waveformCacheProjectIdRef.current = project.id;
      setWaveformCache({});
      return;
    }
    const mediaIds = selectsList.filter((s) => s?.id != null).map((s) => s.id);
    if (mediaIds.length === 0) return;

    let cancelled = false;
    mediaIds.forEach((mediaId) => {
      window.electronAPI.waveform.getPeaks(mediaId).then((result) => {
        if (cancelled) return;
        if (result?.success && Array.isArray(result.peaks)) {
          setWaveformCache((prev) => ({
            ...prev,
            [mediaId]: { peaks: result.peaks, durationSec: result.durationSec ?? 0 },
          }));
        }
      }).catch(() => { /* ignore per-clip failures */ });
    });
    return () => { cancelled = true; };
  }, [project?.id, selectIdsKey]);

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
      setTranscriptEmptyReason(null);
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
        let lines = [];
        if (data?.words?.length) {
          try {
            lines = buildTranscriptLines(data.words);
          } catch (e) {
            console.warn('Failed to build transcript lines:', e?.message);
          }
        }
        setTranscriptLines(lines);
        setTranscriptEmptyReason(
          data == null
            ? null
            : !data.words || data.words.length === 0
              ? (data.emptyReason ?? null)
              : null
        );
      } catch (err) {
        console.error('Failed to load transcript:', err);
        if (!cancelled) {
          setTranscriptLines([]);
          setTranscriptEmptyReason(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSelectId]);

  // Run transcription for all project media without a transcript (once per project, not while in progress)
  useEffect(() => {
    if (!project?.id || !window.electronAPI?.transcription?.runForProject) return;
    if (transcriptionInProgressRef.current) return;
    if (transcriptionStartedForProjectIdRef.current === project.id) return;

    transcriptionInProgressRef.current = true;
    transcriptionStartedForProjectIdRef.current = project.id;

    window.electronAPI.transcription
      .runForProject(project.id)
      .then((result) => {
        if (!result?.success) {
          console.error('Transcription runForProject failed:', result?.error);
          setTranscriptionErrors([{ mediaId: null, message: result?.error || 'Transcription failed' }]);
          return;
        }
        if (result.errors?.length > 0) {
          setTranscriptionErrors(result.errors);
        }
        const mediaIdToRefresh = selectedSelectIdRef.current;
        if (mediaIdToRefresh == null) return;
        return window.electronAPI.transcription.getByMediaId(mediaIdToRefresh).then((res) => {
          if (!res?.success || selectedSelectIdRef.current !== mediaIdToRefresh) return;
          const data = res.data;
          setTranscriptLines(data?.words ? buildTranscriptLines(data.words) : []);
          setTranscriptEmptyReason(
            data && (!data.words || data.words.length === 0) ? (data.emptyReason ?? null) : null
          );
        });
      })
      .catch((err) => {
        console.error('Transcription runForProject failed:', err);
        setTranscriptionErrors([{ mediaId: null, message: err?.message || String(err) }]);
      })
      .finally(() => {
        transcriptionInProgressRef.current = false;
      });
  }, [project?.id]);

  const handleAccept = useCallback((clipId) => {
    const clip = selectsList.find((s) => s.id === clipId);
    setSelects((prev) =>
      prev.map((s) => (s.id === clipId ? { ...s, status: 'accepted' } : s))
    );
    if (clip && window.electronAPI?.media?.updateHighlights) {
      window.electronAPI.media.updateHighlights(clipId, clip.highlights || []).catch(() => {});
    }
  }, [selectsList]);

  const handleDelete = useCallback((clipId) => {
    setSelects((prev) =>
      prev.map((s) => (s.id === clipId ? { ...s, status: 'deleted' } : s))
    );
    setSelectedSelectId((id) => (id === clipId ? null : id));
  }, []);

  const updateSelectHighlights = useCallback((mediaId, nextHighlights) => {
    let normalized = [];
    setSelects((prev) =>
      prev.map((s) => {
        if (s.id !== mediaId) return s;
        const duration = s.duration != null ? Number(s.duration) : 0;
        normalized = normalizeHighlights(
          Array.isArray(nextHighlights) ? nextHighlights : [],
          duration
        );
        return {
          ...s,
          highlights: normalized,
          highlightCount: normalized.length,
        };
      })
    );
    if (window.electronAPI?.media?.updateHighlights && normalized.length >= 0) {
      if (persistHighlightsTimeoutRef.current) clearTimeout(persistHighlightsTimeoutRef.current);
      persistHighlightsTimeoutRef.current = setTimeout(() => {
        persistHighlightsTimeoutRef.current = null;
        window.electronAPI.media.updateHighlights(mediaId, normalized).catch(() => {});
      }, 500);
    }
  }, []);

  const handleAddHighlightFromInOut = useCallback(
    (inSec, outSec) => {
      if (selectedSelectId == null) return;
      const inNum = Number(inSec);
      const outNum = Number(outSec);
      if (!Number.isFinite(inNum) || !Number.isFinite(outNum) || outNum <= inNum) return;
      const clip = selectsList.find((s) => s.id === selectedSelectId);
      const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
      const next = [...current, { id: generateHighlightId(), in: inNum, out: outNum }];
      updateSelectHighlights(selectedSelectId, next);
    },
    [selectedSelectId, selectsList, updateSelectHighlights]
  );

  const handleHighlightInOutChange = useCallback(
    (highlightId, patch) => {
      if (selectedSelectId == null) return;
      const clip = selectsList.find((s) => s.id === selectedSelectId);
      const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
      const next = current.map((h) => (h.id === highlightId ? { ...h, ...patch } : h));
      updateSelectHighlights(selectedSelectId, next);
    },
    [selectedSelectId, selectsList, updateSelectHighlights]
  );

  const handleRemoveHighlight = useCallback(
    (highlightId) => {
      if (selectedSelectId == null) return;
      const clip = selectsList.find((s) => s.id === selectedSelectId);
      const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
      const next = current.filter((h) => h.id !== highlightId);
      updateSelectHighlights(selectedSelectId, next);
    },
    [selectedSelectId, selectsList, updateSelectHighlights]
  );

  const allDecided = selectsList.length > 0 && selectsList.every((s) => s.status === 'accepted' || s.status === 'deleted');
  const acceptedClips = selectsList.filter((s) => s.status === 'accepted');
  const acceptedClipsWithNoHighlights = acceptedClips.filter(
    (c) => !Array.isArray(c.highlights) || c.highlights.length === 0
  );

  const [showNoHighlightsModal, setShowNoHighlightsModal] = useState(false);

  useEffect(() => {
    if (showNoHighlightsModal && acceptedClipsWithNoHighlights.length === 0) {
      setShowNoHighlightsModal(false);
    }
  }, [showNoHighlightsModal, acceptedClipsWithNoHighlights.length]);

  const handleProceedToReviewTimeline = useCallback(() => {
    if (!allDecided || !onNavigateToTimelineReview) return;
    if (acceptedClipsWithNoHighlights.length > 0) {
      setShowNoHighlightsModal(true);
      return;
    }
    onNavigateToTimelineReview(acceptedClips);
  }, [allDecided, acceptedClips, acceptedClipsWithNoHighlights.length, onNavigateToTimelineReview]);

  const handleResolveNoHighlightsDelete = useCallback((clipId) => {
    handleDelete(clipId);
  }, [handleDelete]);

  const handleResolveNoHighlightsReviewClip = useCallback((clipId) => {
    setSelectedSelectId(clipId);
    setShowNoHighlightsModal(false);
  }, []);

  const selectedClip = selectsList.find((s) => s.id === selectedSelectId);
  const videoUrl = selectedSelectId ? `media://local/${selectedSelectId}` : null;
  const rawDuration = selectedClip?.duration != null ? selectedClip.duration : 0;
  const durationSec = Number.isFinite(Number(rawDuration))
    ? Math.max(0, Math.min(86400, Number(rawDuration)))
    : 0;

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
      {showNoHighlightsModal && acceptedClipsWithNoHighlights.length > 0 && (
        <>
          <div
            className="timeline-no-highlights-modal-backdrop"
            onClick={() => setShowNoHighlightsModal(false)}
            aria-hidden="true"
          />
          <div
            className="timeline-no-highlights-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-no-highlights-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="timeline-no-highlights-modal-title" className="timeline-no-highlights-modal__title">
              Some accepted clips have no highlights
            </h2>
            <p className="timeline-no-highlights-modal__message">
              Add at least one highlight to each accepted clip, or remove the clip from accepted.
            </p>
            <ul className="timeline-no-highlights-modal__list">
              {acceptedClipsWithNoHighlights.map((clip) => (
                <li key={clip.id} className="timeline-no-highlights-modal__item">
                  <span className="timeline-no-highlights-modal__clip-name">{clip.clipName || `Clip ${clip.id}`}</span>
                  <span className="timeline-no-highlights-modal__actions">
                    <Button
                      variant="secondary"
                      onClick={() => handleResolveNoHighlightsDelete(clip.id)}
                      className="timeline-no-highlights-modal__btn"
                    >
                      Delete
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleResolveNoHighlightsReviewClip(clip.id)}
                      className="timeline-no-highlights-modal__btn"
                    >
                      Review clip
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="timeline-no-highlights-modal__footer">
              <Button variant="secondary" onClick={() => setShowNoHighlightsModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}
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
            transcriptEmptyReason={transcriptEmptyReason}
            transcriptionErrors={transcriptionErrors}
            currentTimeSec={currentTimeSec}
            onSeek={handleSeek}
            highlights={selectedClip?.highlights ?? []}
            onHighlightsChange={updateSelectHighlights}
            onAddHighlightFromSelection={handleAddHighlightFromInOut}
          />
        </div>
        <div className="timeline__playback-column">
          <PlaybackModule
            videoUrl={videoUrl}
            selectedMediaId={selectedSelectId}
            preloadedWaveform={selectedSelectId ? waveformCache[selectedSelectId] : null}
            durationSec={durationSec}
            currentTimeSec={currentTimeSec}
            isPlaying={isPlaying}
            onTimeUpdate={handleTimeUpdate}
            onSeek={handleSeek}
            onPlayStateChange={handlePlayStateChange}
            highlightRanges={selectedClip?.highlights ?? []}
            onAddHighlightFromInOut={handleAddHighlightFromInOut}
            onHighlightInOutChange={handleHighlightInOutChange}
            onRemoveHighlight={handleRemoveHighlight}
            showFullClipTimeline
          />
        </div>
      </div>
    </div>
  );
}

export default Timeline;
