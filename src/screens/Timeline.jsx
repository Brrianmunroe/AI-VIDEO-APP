import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import TranscriptPanel from '../components/TranscriptPanel';
import PlaybackModule from '../components/PlaybackModule';
import Button from '../components/Button';
import HighlightInfoModal from '../components/HighlightInfoModal';
import './styles/Timeline.css';

/** Generate a unique id for a highlight (e.g. for React keys and updates). */
function generateHighlightId() {
  return `highlight_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Normalize highlights: sort by in, ensure in < out, clamp to [0, duration]. Preserve reason, suggestions, ordinal, and status. */
function normalizeHighlights(highlights, durationSec) {
  if (!Array.isArray(highlights) || highlights.length === 0) return [];
  const dur = Number.isFinite(durationSec) && durationSec >= 0 ? durationSec : 86400;
  return highlights
    .filter((h) => h != null && typeof h.id === 'string')
    .map((h, idx) => ({
      id: h.id,
      in: Math.max(0, Math.min(dur, Number(h.in) || 0)),
      out: Math.max(0, Math.min(dur, Number(h.out) || 0)),
      reason: h.reason != null ? String(h.reason) : '',
      suggestions: h.suggestions != null ? String(h.suggestions) : '',
      ordinal: typeof h.ordinal === 'number' && h.ordinal >= 1 ? h.ordinal : idx + 1,
      status: h.status === 'accepted' ? 'accepted' : 'pending',
    }))
    .filter((h) => h.out > h.in)
    .sort((a, b) => a.in - b.in);
}

/** Next ordinal for a new highlight (max existing + 1; never renumbers on delete). */
function nextHighlightOrdinal(highlights) {
  if (!Array.isArray(highlights) || highlights.length === 0) return 1;
  const max = Math.max(0, ...highlights.map((h) => (typeof h.ordinal === 'number' ? h.ordinal : 0)));
  return max + 1;
}

function mediaToSelect(m) {
  if (!m || m.id == null) return null;
  const duration = m.duration != null ? Number(m.duration) : 0;
  const rawHighlights = Array.isArray(m.highlights) ? m.highlights : [];
  const highlights = rawHighlights.length
    ? rawHighlights.map((h, idx) => ({
        id: h.id != null ? String(h.id) : generateHighlightId(),
        in: Number(h.in) || 0,
        out: Number(h.out) || 0,
        reason: h.reason != null ? String(h.reason) : '',
        suggestions: h.suggestions != null ? String(h.suggestions) : '',
        ordinal: typeof h.ordinal === 'number' && h.ordinal >= 1 ? h.ordinal : idx + 1,
        status: h.status === 'accepted' ? 'accepted' : 'pending',
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

/** Normalize segment-level words to lines with { start, end, text, words } (preserve speaker_id) */
function wordsToLines(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  return words.map((w) => {
    const wordObj = {
      word: typeof w.word === 'string' ? w.word : String(w.word ?? ''),
      start: Number(w.start) || 0,
      end: Number(w.end) || 0,
      speaker_id: w.speaker_id != null ? Number(w.speaker_id) : 0,
    };
    return {
      start: wordObj.start,
      end: wordObj.end,
      text: wordObj.word,
      words: [wordObj],
    };
  });
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
    speaker_id: w.speaker_id != null ? Number(w.speaker_id) : 0,
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
  const [selectedHighlightId, setSelectedHighlightId] = useState(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState([]);
  const [speakerLabels, setSpeakerLabels] = useState({});
  const [transcriptEmptyReason, setTranscriptEmptyReason] = useState(null);
  const [transcriptionErrors, setTranscriptionErrors] = useState([]);
  const [waveformCache, setWaveformCache] = useState({});
  const selectedSelectIdRef = useRef(null);
  const transcriptionStartedForProjectIdRef = useRef(null);
  const transcriptionInProgressRef = useRef(false);
  const persistHighlightsTimeoutRef = useRef(null);
  const selectAndSeekRef = useRef(null);

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
    // If user chose a highlight row (select+seek), don't overwrite currentTimeSec with 0
    if (selectAndSeekRef.current?.clipId === selectedSelectId && selectAndSeekRef.current.seekTo != null) {
      selectAndSeekRef.current = null;
    } else {
      setCurrentTimeSec(0);
    }
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
        setSpeakerLabels(data?.speakerLabels && typeof data.speakerLabels === 'object' ? data.speakerLabels : {});
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
          setSpeakerLabels({});
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
          setSpeakerLabels(data?.speakerLabels && typeof data.speakerLabels === 'object' ? data.speakerLabels : {});
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

  const handleAccept = useCallback(
    (clipId, highlightId) => {
      if (clipId == null) {
        // Accept all pending clips (and all their highlights)
        const toAccept = selectsList.filter((s) => s.status === 'pending');
        setSelects((prev) =>
          prev.map((s) => {
            if (s.status !== 'pending') return s;
            const h = Array.isArray(s.highlights) ? s.highlights : [];
            const nextH = h.length > 0 ? h.map((x) => ({ ...x, status: 'accepted' })) : h;
            return { ...s, status: 'accepted', highlights: nextH };
          })
        );
        toAccept.forEach((clip) => {
          const h = Array.isArray(clip.highlights) ? clip.highlights : [];
          const nextH = h.length > 0 ? h.map((x) => ({ ...x, status: 'accepted' })) : h;
          if (window.electronAPI?.media?.updateHighlights) {
            window.electronAPI.media.updateHighlights(clip.id, nextH.length > 0 ? nextH : clip.highlights || []).catch(() => {});
          }
        });
        return;
      }
      if (highlightId != null) {
        // Accept only the selected highlight
        const clip = selectsList.find((s) => s.id === clipId);
        const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
        const next = current.map((h) =>
          h.id === highlightId ? { ...h, status: 'accepted' } : h
        );
        updateSelectHighlights(clipId, next);
        return;
      }
      // Accept the selected clip (whole clip: clip status + all its highlights)
      const clip = selectsList.find((s) => s.id === clipId);
      const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
      const nextHighlights =
        current.length > 0
          ? current.map((h) => ({ ...h, status: 'accepted' }))
          : current;
      setSelects((prev) =>
        prev.map((s) =>
          s.id === clipId
            ? { ...s, status: 'accepted', highlights: nextHighlights }
            : s
        )
      );
      if (clip && window.electronAPI?.media?.updateHighlights) {
        window.electronAPI.media.updateHighlights(clipId, nextHighlights).catch(() => {});
      }
    },
    [selectsList, updateSelectHighlights]
  );

  const handleDelete = useCallback((clipId) => {
    setSelects((prev) =>
      prev.map((s) => (s.id === clipId ? { ...s, status: 'deleted' } : s))
    );
    setSelectedSelectId((id) => (id === clipId ? null : id));
    setSelectedHighlightId(null);
  }, []);

  const handleAddHighlightFromInOut = useCallback(
    (inSec, outSec) => {
      if (selectedSelectId == null) return;
      const inNum = Number(inSec);
      const outNum = Number(outSec);
      if (!Number.isFinite(inNum) || !Number.isFinite(outNum) || outNum <= inNum) return;
      const clip = selectsList.find((s) => s.id === selectedSelectId);
      const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
      const nextOrdinal = nextHighlightOrdinal(current);
      const next = [
        ...current,
        {
          id: generateHighlightId(),
          in: inNum,
          out: outNum,
          reason: '',
          suggestions: '',
          ordinal: nextOrdinal,
          status: 'pending',
        },
      ];
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
      setSelectedHighlightId((prev) => (prev === highlightId ? null : prev));
    },
    [selectedSelectId, selectsList, updateSelectHighlights]
  );

  const allDecided =
    selectsList.length > 0 &&
    selectsList.every((s) => {
      if (s.status === 'deleted') return true;
      if (s.status === 'accepted') return true;
      const highlights = Array.isArray(s.highlights) ? s.highlights : [];
      if (highlights.length === 0) return false; // pending clip with no highlights
      return highlights.every((h) => h.status === 'accepted');
    });
  const acceptedClips = selectsList.filter((s) => {
    if (s.status === 'accepted') return true;
    const highlights = Array.isArray(s.highlights) ? s.highlights : [];
    if (highlights.length === 0) return false;
    return highlights.every((h) => h.status === 'accepted');
  });
  const acceptedClipsWithNoHighlights = acceptedClips.filter(
    (c) => !Array.isArray(c.highlights) || c.highlights.length === 0
  );

  const [showNoHighlightsModal, setShowNoHighlightsModal] = useState(false);
  const [highlightInfoModal, setHighlightInfoModal] = useState(null);

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
    setSelectedHighlightId(null);
    setShowNoHighlightsModal(false);
  }, []);

  const selectedClip = selectsList.find((s) => s.id === selectedSelectId);
  const videoUrl = selectedSelectId ? `media://local/${selectedSelectId}` : null;

  /** Ordered list of highlight rows (one per highlight; one per clip when 0 highlights) for prev/next navigation */
  const orderedHighlightRows = useMemo(() => {
    const rows = [];
    const visible = selectsList.filter((s) => s?.id != null && s.status !== 'deleted');
    visible.forEach((s) => {
      const highlights = Array.isArray(s.highlights) ? s.highlights : [];
      if (highlights.length === 0) {
        rows.push({
          clipId: s.id,
          highlightId: null,
          in: 0,
          out: Math.max(0, Number(s.duration) || 0),
        });
      } else {
        highlights.forEach((h) => {
          rows.push({
            clipId: s.id,
            highlightId: h.id,
            in: Number(h.in) || 0,
            out: Number(h.out) || 0,
          });
        });
      }
    });
    return rows;
  }, [selectsList]);
  const rawDuration = selectedClip?.duration != null ? selectedClip.duration : 0;
  const durationSec = Number.isFinite(Number(rawDuration))
    ? Math.max(0, Math.min(86400, Number(rawDuration)))
    : 0;

  const handleSeek = useCallback((seconds) => {
    setCurrentTimeSec(seconds);
  }, []);

  const handleSelectClipAndSeek = useCallback((clipId, seekToSec, highlightId) => {
    selectAndSeekRef.current = { clipId, seekTo: seekToSec };
    setSelectedSelectId(clipId);
    setSelectedHighlightId(highlightId ?? null);
    setCurrentTimeSec(seekToSec);
  }, []);

  const handlePreviousClip = useCallback(() => {
    if (orderedHighlightRows.length === 0 || !selectedSelectId) return;

    const t = Number(currentTimeSec);
    const clipRows = orderedHighlightRows.filter((r) => r.clipId === selectedSelectId);
    if (clipRows.length === 0) return;

    const inside = orderedHighlightRows.find(
      (r) => r.clipId === selectedSelectId && r.highlightId != null && t >= r.in && t < r.out
    );
    let currentIdx;
    if (inside) {
      currentIdx = orderedHighlightRows.indexOf(inside);
    } else {
      const nextOnClip = clipRows.find((r) => r.in > t);
      if (nextOnClip) {
        currentIdx = orderedHighlightRows.indexOf(nextOnClip);
      } else {
        currentIdx = orderedHighlightRows.indexOf(clipRows[clipRows.length - 1]) + 1;
      }
    }

    const prevIdx = currentIdx - 1;
    if (prevIdx < 0) return;

    const target = orderedHighlightRows[prevIdx];
    handleSelectClipAndSeek(target.clipId, target.in, target.highlightId ?? undefined);
  }, [orderedHighlightRows, selectedSelectId, currentTimeSec, handleSelectClipAndSeek]);

  // When playhead moves within the selected clip, sync selection to the highlight at that time
  useEffect(() => {
    if (!selectedClip || !selectedSelectId || currentTimeSec == null) return;
    const highlights = Array.isArray(selectedClip.highlights) ? selectedClip.highlights : [];
    const containingHighlight = highlights.find(
      (h) => currentTimeSec >= (Number(h.in) || 0) && currentTimeSec < (Number(h.out) || 0)
    );
    if (containingHighlight) {
      setSelectedHighlightId((prev) => (prev === containingHighlight.id ? prev : containingHighlight.id));
    }
  }, [selectedClip, selectedSelectId, currentTimeSec]);

  const handlePlayStateChange = useCallback((playing) => {
    setIsPlaying(playing);
  }, []);

  const handleTimeUpdate = useCallback((seconds) => {
    setCurrentTimeSec(seconds);
  }, []);

  const handleSpeakerLabelChange = useCallback((mediaId, nextLabels) => {
    if (mediaId == null || typeof nextLabels !== 'object') return;
    setSpeakerLabels((prev) => {
      const merged = { ...prev, ...nextLabels };
      window.electronAPI?.transcription?.updateSpeakerLabels?.(mediaId, merged).then((res) => {
        if (!res?.success) setSpeakerLabels((p) => ({ ...p })); // revert on failure
      }).catch(() => {});
      return merged;
    });
  }, []);

  const handleSelectInfo = useCallback((row) => {
    if (row?.highlightId != null) {
      setHighlightInfoModal(row);
    }
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
      <HighlightInfoModal
        isOpen={highlightInfoModal != null}
        onClose={() => setHighlightInfoModal(null)}
        highlight={highlightInfoModal ?? undefined}
      />
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
            selectedHighlightId={selectedHighlightId}
            onSelectClip={setSelectedSelectId}
            onSelectClipAndSeek={handleSelectClipAndSeek}
            onRemoveHighlight={handleRemoveHighlight}
            onSelectInfo={handleSelectInfo}
            onDelete={handleDelete}
            onAccept={handleAccept}
            onProceedToReviewTimeline={handleProceedToReviewTimeline}
            allDecided={allDecided}
            transcript={Array.isArray(transcriptLines) ? transcriptLines : []}
            speakerLabels={speakerLabels}
            selectedMediaId={selectedSelectId}
            onSpeakerLabelChange={handleSpeakerLabelChange}
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
            onPreviousClip={orderedHighlightRows.length > 0 ? handlePreviousClip : undefined}
            showFullClipTimeline
          />
        </div>
      </div>
    </div>
  );
}

export default Timeline;
