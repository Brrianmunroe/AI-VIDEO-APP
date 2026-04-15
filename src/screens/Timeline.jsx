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
const UNDO_MAX_HISTORY = 50;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

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
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const isDraggingHighlightRef = useRef(false);
  const lastClickedRowIndexRef = useRef(null);
  const [, setUndoRedoVersion] = useState(0);

  const [selectedRowIndices, setSelectedRowIndices] = useState(() => new Set());
  const selectsList = Array.isArray(selects) ? selects : [];

  const pushUndo = useCallback(() => {
    const snapshot = { selects: deepClone(selects), speakerLabels: deepClone(speakerLabels) };
    undoStackRef.current = [...undoStackRef.current.slice(-(UNDO_MAX_HISTORY - 1)), snapshot];
    redoStackRef.current = [];
    setUndoRedoVersion((v) => v + 1);
  }, [selects, speakerLabels]);

  const persistRestoredState = useCallback((restoredSelects, restoredSpeakerLabels) => {
    if (window.electronAPI?.media?.updateHighlights) {
      restoredSelects.forEach((s) => {
        const h = Array.isArray(s.highlights) ? s.highlights : [];
        window.electronAPI.media.updateHighlights(s.id, h).catch(() => {});
      });
    }
    if (selectedSelectId && window.electronAPI?.transcription?.updateSpeakerLabels && typeof restoredSpeakerLabels === 'object') {
      window.electronAPI.transcription.updateSpeakerLabels(selectedSelectId, restoredSpeakerLabels).catch(() => {});
    }
  }, [selectedSelectId]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop();
    redoStackRef.current = [...redoStackRef.current, { selects: deepClone(selects), speakerLabels: deepClone(speakerLabels) }];
    setSelects(prev.selects);
    setSpeakerLabels(prev.speakerLabels || {});
    if (persistHighlightsTimeoutRef.current) {
      clearTimeout(persistHighlightsTimeoutRef.current);
      persistHighlightsTimeoutRef.current = null;
    }
    persistRestoredState(prev.selects, prev.speakerLabels);
    setUndoRedoVersion((v) => v + 1);
  }, [selects, speakerLabels, persistRestoredState]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    undoStackRef.current = [...undoStackRef.current, { selects: deepClone(selects), speakerLabels: deepClone(speakerLabels) }];
    setSelects(next.selects);
    setSpeakerLabels(next.speakerLabels || {});
    if (persistHighlightsTimeoutRef.current) {
      clearTimeout(persistHighlightsTimeoutRef.current);
      persistHighlightsTimeoutRef.current = null;
    }
    persistRestoredState(next.selects, next.speakerLabels);
    setUndoRedoVersion((v) => v + 1);
  }, [selects, speakerLabels, persistRestoredState]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

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
        undoStackRef.current = [];
        redoStackRef.current = [];
        setUndoRedoVersion((v) => v + 1);
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

  const updateSelectHighlights = useCallback((mediaId, nextHighlights, options = {}) => {
    if (!options.skipUndo) pushUndo();
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
  }, [pushUndo]);

  const handleDelete = useCallback((clipId, options = {}) => {
    if (!options.skipUndo) pushUndo();
    setSelects((prev) =>
      prev.map((s) => (s.id === clipId ? { ...s, status: 'deleted' } : s))
    );
    setSelectedSelectId((id) => (id === clipId ? null : id));
    setSelectedHighlightId(null);
    setSelectedRowIndices(new Set());
  }, [pushUndo]);

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

  const handleHighlightDragStart = useCallback(() => {
    pushUndo();
    isDraggingHighlightRef.current = true;
  }, [pushUndo]);

  const handleHighlightDragEnd = useCallback(() => {
    isDraggingHighlightRef.current = false;
  }, []);

  const handleHighlightInOutChange = useCallback(
    (highlightId, patch) => {
      if (selectedSelectId == null) return;
      const clip = selectsList.find((s) => s.id === selectedSelectId);
      const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
      const next = current.map((h) => (h.id === highlightId ? { ...h, ...patch } : h));
      updateSelectHighlights(selectedSelectId, next, { skipUndo: isDraggingHighlightRef.current });
    },
    [selectedSelectId, selectsList, updateSelectHighlights]
  );

  const handleRemoveHighlight = useCallback(
    (highlightId, clipIdOverride) => {
      const clipId = clipIdOverride ?? selectedSelectId;
      if (clipId == null) return;
      const clip = selectsList.find((s) => s.id === clipId);
      const current = Array.isArray(clip?.highlights) ? clip.highlights : [];
      const next = current.filter((h) => h.id !== highlightId);
      updateSelectHighlights(clipId, next);
      setSelectedHighlightId((prev) => (prev === highlightId ? null : prev));
      setSelectedRowIndices(new Set());
    },
    [selectedSelectId, selectsList, updateSelectHighlights]
  );

  const HIGHLIGHT_DELETE_ANIMATION_MS = 750;
  const [deletingHighlightIds, setDeletingHighlightIds] = useState(new Set());
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

  const handleSelectClipAndSeek = useCallback((clipId, seekToSec, highlightId, rowIndex) => {
    selectAndSeekRef.current = { clipId, seekTo: seekToSec };
    setSelectedSelectId(clipId);
    setSelectedHighlightId(highlightId ?? null);
    setCurrentTimeSec(seekToSec);
    if (typeof rowIndex === 'number' && rowIndex >= 0) {
      setSelectedRowIndices(new Set([rowIndex]));
      lastClickedRowIndexRef.current = rowIndex;
    }
  }, []);

  const handleAccept = useCallback(
    (clipId, highlightId) => {
      pushUndo();
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
        updateSelectHighlights(clipId, next, { skipUndo: true });
        // Auto-select the row below so user can keep working without clicking
        const currentIndex = orderedHighlightRows.findIndex(
          (r) => r.clipId === clipId && r.highlightId === highlightId
        );
        if (
          currentIndex >= 0 &&
          currentIndex + 1 < orderedHighlightRows.length
        ) {
          const nextRow = orderedHighlightRows[currentIndex + 1];
          handleSelectClipAndSeek(
            nextRow.clipId,
            nextRow.in,
            nextRow.highlightId ?? undefined,
            currentIndex + 1
          );
        }
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
    [selectsList, updateSelectHighlights, pushUndo, orderedHighlightRows, handleSelectClipAndSeek]
  );

  const handleRequestRemoveHighlight = useCallback(
    (highlightId) => {
      if (highlightId == null) return;
      const currentIdx = orderedHighlightRows.findIndex((r) => r.highlightId === highlightId);
      const nextRow =
        currentIdx >= 0 && currentIdx + 1 < orderedHighlightRows.length
          ? orderedHighlightRows[currentIdx + 1]
          : null;
      const nextRowNewIndex = nextRow != null ? currentIdx : null;
      setDeletingHighlightIds((prev) => new Set(prev).add(highlightId));
      setTimeout(() => {
        handleRemoveHighlight(highlightId);
        if (nextRow != null && typeof nextRowNewIndex === 'number') {
          handleSelectClipAndSeek(
            nextRow.clipId,
            nextRow.in,
            nextRow.highlightId ?? undefined,
            nextRowNewIndex
          );
        }
        setDeletingHighlightIds((prev) => {
          const next = new Set(prev);
          next.delete(highlightId);
          return next;
        });
      }, HIGHLIGHT_DELETE_ANIMATION_MS);
    },
    [handleRemoveHighlight, orderedHighlightRows, handleSelectClipAndSeek]
  );

  const handleRowClick = useCallback(
    (row, rowIndex, e) => {
      const lastIdx = lastClickedRowIndexRef.current;
      lastClickedRowIndexRef.current = rowIndex;

      let nextIndices;
      if (e.shiftKey) {
        const lo = lastIdx != null ? Math.min(lastIdx, rowIndex) : rowIndex;
        const hi = lastIdx != null ? Math.max(lastIdx, rowIndex) : rowIndex;
        nextIndices = new Set([...Array(hi - lo + 1)].map((_, i) => lo + i));
      } else if (e.metaKey || e.ctrlKey) {
        nextIndices = new Set(selectedRowIndices);
        if (nextIndices.has(rowIndex)) nextIndices.delete(rowIndex);
        else nextIndices.add(rowIndex);
        if (nextIndices.size === 0) nextIndices = new Set([rowIndex]);
      } else {
        nextIndices = new Set([rowIndex]);
      }
      setSelectedRowIndices(nextIndices);

      selectAndSeekRef.current = { clipId: row.clipId, seekTo: row.in };
      setSelectedSelectId(row.clipId);
      setSelectedHighlightId(row.highlightId ?? null);
      setCurrentTimeSec(row.in);
    },
    [selectedRowIndices]
  );

  const handleAcceptSelection = useCallback(
    (indices) => {
      if (!indices || indices.size === 0) return;
      const rows = [...indices].map((i) => orderedHighlightRows[i]).filter(Boolean);
      if (rows.length === 0) return;
      const allAccepted = rows.every((r) => {
        if (r.highlightId == null) {
          const clip = selectsList.find((s) => s.id === r.clipId);
          return clip?.status === 'accepted';
        }
        const clip = selectsList.find((s) => s.id === r.clipId);
        return clip?.highlights?.find((h) => h.id === r.highlightId)?.status === 'accepted';
      });
      if (allAccepted) return;
      pushUndo();
      const clipIdsToAcceptWhole = new Set(rows.filter((r) => r.highlightId == null).map((r) => r.clipId));
      const highlightIdsByClip = new Map();
      rows.forEach((r) => {
        if (r.highlightId != null && !clipIdsToAcceptWhole.has(r.clipId)) {
          const set = highlightIdsByClip.get(r.clipId) ?? new Set();
          set.add(r.highlightId);
          highlightIdsByClip.set(r.clipId, set);
        }
      });
      const nextSelects = selectsList.map((s) => {
        if (clipIdsToAcceptWhole.has(s.id)) {
          const h = Array.isArray(s.highlights) ? s.highlights : [];
          const nextH = h.length > 0 ? h.map((x) => ({ ...x, status: 'accepted' })) : h;
          return { ...s, status: 'accepted', highlights: nextH };
        }
        const toAccept = highlightIdsByClip.get(s.id);
        if (!toAccept?.size) return s;
        const current = Array.isArray(s.highlights) ? s.highlights : [];
        const next = current.map((h) => (toAccept.has(h.id) ? { ...h, status: 'accepted' } : h));
        return { ...s, highlights: next };
      });
      setSelects(nextSelects);
      nextSelects.forEach((clip) => {
        if (!clip?.id) return;
        const toPersist = Array.isArray(clip.highlights) ? clip.highlights : [];
        if (toPersist.length > 0 || clipIdsToAcceptWhole.has(clip.id)) {
          window.electronAPI?.media?.updateHighlights(clip.id, toPersist).catch(() => {});
        }
      });
    },
    [orderedHighlightRows, selectsList, pushUndo]
  );

  const handleDeleteSelection = useCallback(
    (indices) => {
      if (!indices || indices.size === 0) return;
      const rows = [...indices].map((i) => orderedHighlightRows[i]).filter(Boolean);
      if (rows.length === 0) return;
      pushUndo();
      const clipIdsToDelete = new Set(rows.filter((r) => r.highlightId == null).map((r) => r.clipId));
      const highlightsToRemoveByClip = new Map();
      rows.forEach((r) => {
        if (r.highlightId != null && !clipIdsToDelete.has(r.clipId)) {
          const set = highlightsToRemoveByClip.get(r.clipId) ?? new Set();
          set.add(r.highlightId);
          highlightsToRemoveByClip.set(r.clipId, set);
        }
      });
      const nextSelects = selectsList.map((s) => {
        if (clipIdsToDelete.has(s.id)) return { ...s, status: 'deleted' };
        const toRemove = highlightsToRemoveByClip.get(s.id);
        if (!toRemove?.size) return s;
        const current = Array.isArray(s.highlights) ? s.highlights : [];
        const next = current.filter((h) => !toRemove.has(h.id));
        return { ...s, highlights: next, highlightCount: next.length };
      });
      setSelects(nextSelects);
      clipIdsToDelete.forEach((clipId) => {
        setSelectedSelectId((id) => (id === clipId ? null : id));
      });
      setSelectedHighlightId(null);
      setSelectedRowIndices(new Set());
      nextSelects.forEach((s) => {
        if (s.status === 'deleted' || !s.id) return;
        const toPersist = Array.isArray(s.highlights) ? s.highlights : [];
        if (window.electronAPI?.media?.updateHighlights) {
          window.electronAPI.media.updateHighlights(s.id, toPersist).catch(() => {});
        }
      });
    },
    [orderedHighlightRows, selectsList, pushUndo]
  );

  // Auto-select first highlight when landing on Interview Selects (selects just loaded, nothing selected)
  useEffect(() => {
    if (orderedHighlightRows.length === 0 || selectedSelectId != null) return;
    const first = orderedHighlightRows[0];
    handleSelectClipAndSeek(first.clipId, first.in, first.highlightId ?? undefined, 0);
  }, [orderedHighlightRows, selectedSelectId, handleSelectClipAndSeek]);

  // Command+Enter / Ctrl+Enter to accept selected highlight(s)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      if (selectedRowIndices.size >= 1) {
        handleAcceptSelection(selectedRowIndices);
        return;
      }
      if (selectedSelectId == null) return;
      const clip = selectsList.find((s) => s.id === selectedSelectId);
      const status =
        selectedHighlightId != null
          ? clip?.highlights?.find((h) => h.id === selectedHighlightId)?.status
          : clip?.status;
      if (status === 'accepted') return;
      handleAccept(selectedSelectId, selectedHighlightId);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSelectId, selectedHighlightId, selectsList, handleAccept, selectedRowIndices, handleAcceptSelection]);

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
    handleSelectClipAndSeek(target.clipId, target.in, target.highlightId ?? undefined, prevIdx);
  }, [orderedHighlightRows, selectedSelectId, currentTimeSec, handleSelectClipAndSeek]);

  const handleNextClip = useCallback(() => {
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

    const nextIdx = currentIdx + 1;
    if (nextIdx >= orderedHighlightRows.length) return;

    const target = orderedHighlightRows[nextIdx];
    handleSelectClipAndSeek(target.clipId, target.in, target.highlightId ?? undefined, nextIdx);
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
    pushUndo();
    setSpeakerLabels((prev) => {
      const merged = { ...prev, ...nextLabels };
      window.electronAPI?.transcription?.updateSpeakerLabels?.(mediaId, merged).then((res) => {
        if (!res?.success) setSpeakerLabels((p) => ({ ...p })); // revert on failure
      }).catch(() => {});
      return merged;
    });
  }, [pushUndo]);

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
            selectedRowIndices={selectedRowIndices}
            onSelectClip={setSelectedSelectId}
            onSelectClipAndSeek={handleSelectClipAndSeek}
            onRowClick={handleRowClick}
            onRemoveHighlight={handleRemoveHighlight}
            onRequestRemoveHighlight={handleRequestRemoveHighlight}
            deletingHighlightIds={deletingHighlightIds}
            onSelectInfo={handleSelectInfo}
            onDelete={handleDelete}
            onAccept={handleAccept}
            onAcceptSelection={handleAcceptSelection}
            onDeleteSelection={handleDeleteSelection}
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
            onHighlightDragStart={handleHighlightDragStart}
            onHighlightDragEnd={handleHighlightDragEnd}
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
            onHighlightDragStart={handleHighlightDragStart}
            onHighlightDragEnd={handleHighlightDragEnd}
            onRemoveHighlight={handleRemoveHighlight}
            onRequestRemoveHighlight={handleRequestRemoveHighlight}
            onHighlightSelect={setSelectedHighlightId}
            selectedHighlightId={selectedHighlightId}
            onPreviousClip={orderedHighlightRows.length > 0 ? handlePreviousClip : undefined}
            onNextClip={orderedHighlightRows.length > 0 ? handleNextClip : undefined}
            showFullClipTimeline
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </div>
      </div>
    </div>
  );
}

export default Timeline;
