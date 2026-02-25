import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import Icon from './Icon';
import Button from './Button';
import HighlightContainer from './HighlightContainer';
import './styles/TranscriptPanel.css';

/** Check if word [wStart, wEnd] overlaps highlight [hIn, hOut]. */
function wordOverlapsHighlight(wStart, wEnd, hIn, hOut) {
  return wStart < hOut && wEnd > hIn;
}

/**
 * Get first and last word indices (lineIdx, wordIdx) for each highlight.
 * Words are from transcript lines (each line has .words or we use lineToWords).
 */
function getHighlightBoundaries(transcriptLines, highlights) {
  const boundaries = {};
  if (!Array.isArray(highlights) || highlights.length === 0) return boundaries;
  const list = Array.isArray(transcriptLines) ? transcriptLines : [];
  highlights.forEach((h, index) => {
    let first = null;
    let last = null;
    for (let lineIdx = 0; lineIdx < list.length; lineIdx++) {
      const line = list[lineIdx];
      const words = Array.isArray(line?.words) && line.words.length > 0 ? line.words : lineToWords(line);
      for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
        const w = words[wordIdx];
        if (!w || w.start == null || w.end == null) continue;
        if (!wordOverlapsHighlight(w.start, w.end, h.in, h.out)) continue;
        if (first == null) first = { lineIdx, wordIdx };
        last = { lineIdx, wordIdx };
      }
    }
    if (first != null && last != null) {
      const ord = typeof h.ordinal === 'number' && h.ordinal >= 1 ? h.ordinal : index + 1;
      boundaries[h.id] = { first, last, ordinal: ord };
    }
  });
  return boundaries;
}

/**
 * For a given (lineIdx, wordIdx) and word start/end, return which highlight (id, ordinal) contains it.
 * Uses first matching highlight by array order.
 */
function getWordHighlightInfo(wordStart, wordEnd, highlights) {
  if (!Array.isArray(highlights) || highlights.length === 0) return null;
  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    if (wordOverlapsHighlight(wordStart, wordEnd, h.in, h.out)) {
      const ord = typeof h.ordinal === 'number' && h.ordinal >= 1 ? h.ordinal : i + 1;
      return { id: h.id, ordinal: ord };
    }
  }
  return null;
}

/** Format seconds to M:SS or 0:00 for display */
function formatTimecode(seconds) {
  const s = Math.max(0, Number(seconds));
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Get display time for a line (supports { start, end, text } or legacy { time, text }) */
function lineTime(line) {
  if (line.start != null) return formatTimecode(line.start);
  return line.time ?? '0:00';
}

/**
 * Estimate word-level timestamps within a chunk by splitting text on spaces
 * and distributing the chunk's [start, end] evenly per word (equal time per word).
 * Returns array of { word, start, end } for rendering and word-level highlight.
 */
function lineToWords(line) {
  if (line == null || typeof line.text !== 'string') return [];
  const start = Number(line.start);
  const end = Number(line.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const words = line.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const duration = end - start;
  const step = duration / words.length;
  return words.map((word, idx) => ({
    word,
    start: start + idx * step,
    end: start + (idx + 1) * step,
    speaker_id: 0,
  }));
}

const TABS = [
  { id: 'interview', label: 'Interview Selects' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'clipinfo', label: 'Clip info' },
];

/** Get display name for speaker_id from labels or fallback "Speaker N" */
function getSpeakerDisplayName(speakerId, speakerLabels) {
  const id = String(speakerId);
  if (speakerLabels && typeof speakerLabels[id] === 'string' && speakerLabels[id].trim()) {
    return speakerLabels[id].trim();
  }
  return `Speaker ${Number(speakerId) + 1}`;
}

function TranscriptPanel({
  transcript = [],
  speakerLabels = {},
  selectedMediaId,
  onSpeakerLabelChange,
  transcriptEmptyReason = null,
  transcriptionErrors = [],
  currentTimeSec,
  onSeek,
  selects: selectsProp = [],
  selectedSelectId,
  selectedHighlightId,
  selectedRowIndices,
  onSelectClip,
  onSelectClipAndSeek,
  onRowClick,
  onRemoveHighlight,
  onSelectInfo,
  className = '',
  onDelete,
  onAccept,
  onAcceptSelection,
  onDeleteSelection,
  onProceedToReviewTimeline,
  allDecided = false,
  highlights: highlightsProp = [],
  onHighlightsChange,
  onHighlightDragStart,
  onHighlightDragEnd,
  onAddHighlightFromSelection,
}) {
  const selects = Array.isArray(selectsProp) ? selectsProp : [];
  const transcriptList = Array.isArray(transcript) ? transcript : [];
  const highlights = Array.isArray(highlightsProp) ? highlightsProp : [];
  /** Show only pending and accepted with valid id; deleted clips disappear from the list */
  const visibleSelects = selects.filter((s) => s != null && s.id != null && s.status !== 'deleted');
  /** Flatten to one row per highlight (and one row per clip when clip has 0 highlights) */
  const visibleHighlightRows = useMemo(() => {
    const rows = [];
    visibleSelects.forEach((s) => {
      const highlights = Array.isArray(s.highlights) ? s.highlights : [];
      if (highlights.length === 0) {
        rows.push({
          clipId: s.id,
          thumbnail: s.thumbnail,
          clipName: s.clipName,
          status: s.status,
          highlightId: null,
          in: 0,
          out: Math.max(0, Number(s.duration) || 0),
          ordinal: 0,
          reason: '',
          suggestions: '',
        });
      } else {
        highlights.forEach((h, idx) => {
          const ord = typeof h.ordinal === 'number' && h.ordinal >= 1 ? h.ordinal : idx + 1;
          rows.push({
            clipId: s.id,
            thumbnail: s.thumbnail,
            clipName: s.clipName,
            status: h.status === 'accepted' ? 'accepted' : 'pending',
            highlightId: h.id,
            in: Number(h.in) || 0,
            out: Number(h.out) || 0,
            ordinal: ord,
            reason: h.reason ?? '',
            suggestions: h.suggestions ?? '',
          });
        });
      }
    });
    return rows;
  }, [visibleSelects]);
  const selectedClip = visibleSelects.find((s) => s.id === selectedSelectId);
  const selectedRow = useMemo(
    () =>
      selectedHighlightId != null
        ? visibleHighlightRows.find(
            (r) => r.clipId === selectedSelectId && r.highlightId === selectedHighlightId
          )
        : selectedSelectId != null
          ? visibleHighlightRows.find(
              (r) => r.clipId === selectedSelectId && r.highlightId == null
            ) ?? visibleHighlightRows.find((r) => r.clipId === selectedSelectId)
          : null,
    [visibleHighlightRows, selectedSelectId, selectedHighlightId]
  );
  const selectedIsPending = selectedRow ? selectedRow.status === 'pending' : true;
  const selectedCount = selectedRowIndices?.size ?? 0;
  const hasMultiSelection = selectedCount > 1;
  const selectedRowsForIndices = useMemo(() => {
    if (!hasMultiSelection || !selectedRowIndices) return [];
    return [...selectedRowIndices].map((i) => visibleHighlightRows[i]).filter(Boolean);
  }, [hasMultiSelection, selectedRowIndices, visibleHighlightRows]);
  const hasAnyPendingInSelection = useMemo(() => {
    if (selectedRowsForIndices.length === 0) return selectedIsPending;
    return selectedRowsForIndices.some((r) => r.status === 'pending');
  }, [selectedRowsForIndices, selectedIsPending]);
  const [activeTab, setActiveTab] = useState('interview');
  const [search, setSearch] = useState('');
  const [editingSpeakerId, setEditingSpeakerId] = useState(null);
  const [editingSpeakerValue, setEditingSpeakerValue] = useState('');
  const [editingLineIndex, setEditingLineIndex] = useState(null);
  const activeLineRef = useRef(null);
  const prevActiveLineIndexRef = useRef(-1);
  const selectedRowRef = useRef(null);
  const transcriptContentRef = useRef(null);
  const [draggingHandle, setDraggingHandle] = useState(null);
  const [deletingHighlightIds, setDeletingHighlightIds] = useState(new Set());

  const filteredLines = useMemo(() => {
    if (!search.trim()) return transcriptList;
    const q = search.trim().toLowerCase();
    return transcriptList.filter(
      (line) =>
        line != null &&
        ((line.text && line.text.toLowerCase().includes(q)) ||
          lineTime(line).toLowerCase().includes(q))
    );
  }, [transcriptList, search]);

  const highlightBoundaries = useMemo(
    () => getHighlightBoundaries(filteredLines, highlights),
    [filteredLines, highlights]
  );

  /** Unique speaker IDs from transcript (from words in each line), sorted */
  const speakerIds = useMemo(() => {
    const ids = new Set();
    transcriptList.forEach((line) => {
      const words = Array.isArray(line?.words) && line.words.length > 0 ? line.words : lineToWords(line);
      words.forEach((w) => {
        const sid = w?.speaker_id != null ? Number(w.speaker_id) : 0;
        ids.add(sid);
      });
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [transcriptList]);

  const currentTime = currentTimeSec != null ? Number(currentTimeSec) : null;
  const activeLineIndex = useMemo(() => {
    if (currentTime == null || transcriptList.length === 0) return -1;
    const idx = transcriptList.findIndex(
      (line) => line != null && line.start != null && line.end != null && currentTime >= line.start && currentTime < line.end
    );
    return idx;
  }, [transcriptList, currentTime]);

  useLayoutEffect(() => {
    if (activeTab !== 'transcript') return;
    if (activeLineIndex < 0 || !activeLineRef.current) return;
    const el = activeLineRef.current;
    const isForward = activeLineIndex > prevActiveLineIndexRef.current;
    prevActiveLineIndexRef.current = activeLineIndex;
    requestAnimationFrame(() => {
      el.scrollIntoView({
        block: isForward ? 'start' : 'nearest',
        behavior: 'smooth',
      });
    });
  }, [activeTab, activeLineIndex, currentTime]);

  useLayoutEffect(() => {
    if (activeTab !== 'interview') return;
    if (!selectedRowRef.current) return;
    const el = selectedRowRef.current;
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [activeTab, selectedSelectId, selectedHighlightId]);

  const HIGHLIGHT_DELETE_ANIMATION_MS = 280;

  const handleRequestDeleteHighlight = useCallback(
    (highlightId) => {
      if (highlightId == null || typeof onRemoveHighlight !== 'function') return;
      setDeletingHighlightIds((prev) => new Set(prev).add(highlightId));
      setTimeout(() => {
        onRemoveHighlight(highlightId);
        setDeletingHighlightIds((prev) => {
          const next = new Set(prev);
          next.delete(highlightId);
          return next;
        });
      }, HIGHLIGHT_DELETE_ANIMATION_MS);
    },
    [onRemoveHighlight]
  );

  // Delete/Backspace: remove selected highlight (works from any tab when a highlight is selected)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || selectedHighlightId == null) return;
      if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      handleRequestDeleteHighlight(selectedHighlightId);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHighlightId, handleRequestDeleteHighlight]);

  const handleLineClick = useCallback(
    (line) => {
      if (line.start != null && typeof onSeek === 'function') {
        onSeek(line.start);
      }
    },
    [onSeek]
  );

  const handleWordClick = useCallback(
    (e, w) => {
      e.stopPropagation();
      if (w.start != null && typeof onSeek === 'function') {
        onSeek(w.start);
      }
    },
    [onSeek]
  );

  const applyHighlightInOut = useCallback(
    (highlightId, nextIn, nextOut, options = {}) => {
      if (typeof onHighlightsChange !== 'function' || selectedSelectId == null) return;
      const next = highlights.map((h) =>
        h.id === highlightId ? { ...h, in: nextIn ?? h.in, out: nextOut ?? h.out } : h
      );
      onHighlightsChange(selectedSelectId, next, options);
    },
    [highlights, onHighlightsChange, selectedSelectId]
  );

  const handleTranscriptContentMouseUp = useCallback(() => {
    if (draggingHandle) return;
    if (typeof onAddHighlightFromSelection !== 'function' || selectedSelectId == null) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;
    const content = transcriptContentRef.current;
    if (!content || !content.contains(selection.anchorNode)) return;
    const words = content.querySelectorAll('.transcript-panel__word[data-word-start][data-word-end]');
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const el of words) {
      if (range.intersectsNode(el)) {
        const s = Number(el.getAttribute('data-word-start'));
        const e = Number(el.getAttribute('data-word-end'));
        if (Number.isFinite(s) && Number.isFinite(e)) {
          minStart = Math.min(minStart, s);
          maxEnd = Math.max(maxEnd, e);
        }
      }
    }
    if (minStart < maxEnd) {
      onAddHighlightFromSelection(minStart, maxEnd);
      selection.removeAllRanges();
    }
  }, [draggingHandle, onAddHighlightFromSelection, selectedSelectId]);

  useEffect(() => {
    if (!draggingHandle) return;
    const handleMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const start = el.getAttribute?.('data-word-start');
      const end = el.getAttribute?.('data-word-end');
      const tStart = start != null ? Number(start) : null;
      const tEnd = end != null ? Number(end) : null;
      if (!Number.isFinite(tStart) || !Number.isFinite(tEnd)) return;
      if (draggingHandle.inOrOut === 'in') {
        applyHighlightInOut(draggingHandle.highlightId, tStart, undefined, { skipUndo: true });
      } else {
        applyHighlightInOut(draggingHandle.highlightId, undefined, tEnd, { skipUndo: true });
      }
    };
    const handleUp = () => {
      onHighlightDragEnd?.();
      setDraggingHandle(null);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [draggingHandle, applyHighlightInOut, onHighlightDragEnd]);

  const showNoTranscript = transcriptList.length === 0 && selectedSelectId != null;
  const showSelectClip = selectedSelectId == null;
  const noTranscriptMessage =
    transcriptEmptyReason === 'no_audio'
      ? 'No audio to transcribe.'
      : 'Could not generate transcript.';
  const hasTranscriptionErrors = Array.isArray(transcriptionErrors) && transcriptionErrors.length > 0;

  return (
    <div className={`transcript-panel ${className}`.trim()} role="region" aria-label="Transcript">
      {/* Main container: holds everything */}
      <div className="transcript-panel__container">
        {/* Header: tabs + search (does not grow) */}
        <div className="transcript-panel__header">
          <div className="transcript-panel__tabs" role="tablist" aria-label="Transcript container tabs">
            {TABS.map((tab, index) => (
              <React.Fragment key={tab.id}>
                {index > 0 && <span className="transcript-panel__tab-sep" aria-hidden="true">|</span>}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`transcript-panel-tab-${tab.id}`}
                  id={`tab-${tab.id}`}
                  className={`transcript-panel__tab ${activeTab === tab.id ? 'transcript-panel__tab--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          {activeTab === 'transcript' && (
            <div className="transcript-panel__search">
              <div className="transcript-panel__search-wrapper">
                <Icon type="search" size="sm" state="primary" aria-hidden="true" />
                <input
                  className="transcript-panel__search-input"
                  type="text"
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search"
                />
              </div>
            </div>
          )}
        </div>

        {/* Body: bordered area containing tab content + footer */}
        <div className="transcript-panel__bordered-wrap">
          <div
            id="transcript-panel-tab-interview"
            role="tabpanel"
            aria-labelledby="tab-interview"
            hidden={activeTab !== 'interview'}
            className="transcript-panel__tab-panel"
          >
            <div className="transcript-panel__selects-container">
              <div className="transcript-panel__selects-content" role="list" aria-label="Interview selects">
                {visibleHighlightRows.length === 0 ? (
                  <div className="transcript-panel__placeholder">
                    No clips in this project. Upload videos in the Import step.
                  </div>
                ) : (
                  <div className="transcript-panel__selects-list">
                    {visibleHighlightRows.map((row, index) => {
                      const isDeleting = row.highlightId != null && deletingHighlightIds.has(row.highlightId);
                      const isPrimary =
                        selectedSelectId === row.clipId &&
                        (row.highlightId == null ? selectedHighlightId == null : selectedHighlightId === row.highlightId);
                      const isSelected =
                        selectedRowIndices?.size > 0
                          ? selectedRowIndices.has(index)
                          : isPrimary;
                      return (
                        <div
                          key={row.highlightId != null ? `${row.clipId}-${row.highlightId}` : `${row.clipId}-no-highlights`}
                          ref={isPrimary ? selectedRowRef : undefined}
                          className={`transcript-panel__highlight-row${isDeleting ? ' transcript-panel__highlight-row--deleting' : ''}`}
                        >
                          <HighlightContainer
                            thumbnail={row.thumbnail}
                            clipName={row.clipName}
                            highlightCount={row.ordinal === 0 ? 0 : 1}
                            highlightOrdinal={row.ordinal > 0 ? row.ordinal : undefined}
                            status={row.status}
                            isDeleting={isDeleting}
                            selected={isSelected}
                            onClick={(e) => {
                              if (typeof onRowClick === 'function') {
                                onRowClick(row, index, e);
                              } else if (typeof onSelectClipAndSeek === 'function') {
                                onSelectClipAndSeek(row.clipId, row.in, row.highlightId);
                              } else {
                                onSelectClip?.(row.clipId);
                              }
                            }}
                            onFocus={() => {
                              if (typeof onRowClick === 'function') {
                                onRowClick(row, index, { type: 'focus' });
                              } else if (typeof onSelectClipAndSeek === 'function') {
                                onSelectClipAndSeek(row.clipId, row.in, row.highlightId);
                              } else {
                                onSelectClip?.(row.clipId);
                              }
                            }}
                            showInfoButton={row.highlightId != null}
                            onInfoClick={() => onSelectInfo?.(row)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            id="transcript-panel-tab-transcript"
            role="tabpanel"
            aria-labelledby="tab-transcript"
            hidden={activeTab !== 'transcript'}
            className="transcript-panel__tab-panel"
          >
            {/* Transcript container: fills available space (does not hug content) */}
            <div className="transcript-panel__transcript-container">
              {hasTranscriptionErrors && (
                <div className="transcript-panel__transcription-error-banner" role="status">
                  Transcription failed for some clips. Check Whisper/FFmpeg setup if this persists.
                </div>
              )}
              <div className="transcript-panel__transcript-content-wrap">
              <div
                ref={transcriptContentRef}
                className="transcript-panel__content"
                onMouseUp={handleTranscriptContentMouseUp}
              >
                {showSelectClip && (
                  <div className="transcript-panel__placeholder">
                    Select a clip to view transcript and playback.
                  </div>
                )}
                {showNoTranscript && (
                  <div className="transcript-panel__placeholder">
                    {noTranscriptMessage}
                  </div>
                )}
                {!showSelectClip && !showNoTranscript && (
                  <ul className="transcript-panel__lines" aria-label="Transcript lines">
                    {filteredLines.map((line, i) => {
                      const isActive =
                        currentTime != null &&
                        line.start != null &&
                        line.end != null &&
                        currentTime >= line.start &&
                        currentTime < line.end;
                      const isClickable = line.start != null && typeof onSeek === 'function';
                      const words =
                        Array.isArray(line.words) && line.words.length > 0
                          ? line.words
                          : lineToWords(line);
                      const wordNodes = [];
                      let hasLeadingPill = false;
                      if (words.length === 0) {
                        wordNodes.push(
                          <span key="text" className="transcript-panel__text-inner">
                            {line.text ?? ''}
                          </span>
                        );
                      } else {
                        const runs = [];
                        let run = { highlightId: null, wordIndices: [] };
                        words.forEach((w, wi) => {
                          const highlightInfo = getWordHighlightInfo(w.start, w.end, highlights);
                          const hid = highlightInfo ? highlightInfo.id : null;
                          if (hid === run.highlightId) {
                            run.wordIndices.push(wi);
                          } else {
                            if (run.wordIndices.length > 0) runs.push({ ...run });
                            run = { highlightId: hid, wordIndices: [wi] };
                          }
                        });
                        if (run.wordIndices.length > 0) runs.push(run);

                        runs.forEach((r, runIdx) => {
                          const firstWi = r.wordIndices[0];
                          const lastWi = r.wordIndices[r.wordIndices.length - 1];
                          if (r.highlightId) {
                            const isAccepted = highlights.find((h) => h.id === r.highlightId)?.status === 'accepted';
                            Object.entries(highlightBoundaries).forEach(([hid, b]) => {
                              if (hid !== r.highlightId) return;
                              if (b.first?.lineIdx === i && b.first?.wordIdx === firstWi) {
                                hasLeadingPill = true;
                                wordNodes.push(
                                  <span key={`ord-${hid}`} className="transcript-panel__ordinal-pill" aria-label={`Highlight ${b.ordinal}`}>
                                    {b.ordinal}
                                  </span>
                                );
                                wordNodes.push(
                                  <span
                                    key={`in-${hid}`}
                                    className={`transcript-panel__handle transcript-panel__handle--in${isAccepted ? ' transcript-panel__handle--accepted' : ''}`}
                                    role="slider"
                                    tabIndex={0}
                                    aria-label={`Highlight ${b.ordinal} in point. Drag to adjust.`}
                                    aria-valuenow={highlights.find((h) => h.id === hid)?.in}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onHighlightDragStart?.();
                                      setDraggingHandle({ highlightId: hid, inOrOut: 'in' });
                                    }}
                                  />
                                );
                              }
                            });
                            wordNodes.push(
                              <span
                                key={`run-${i}-${runIdx}`}
                                className={`transcript-panel__highlight-run${isAccepted ? ' transcript-panel__highlight-run--accepted' : ''}`}
                              >
                                {r.wordIndices.map((wi, idx) => {
                                  const w = words[wi];
                                  const isWordActive =
                                    currentTime != null && currentTime >= w.start && currentTime < w.end;
                                  const wordClickable = isClickable && w.start != null;
                                  return (
                                    <React.Fragment key={`w-${i}-${wi}`}>
                                      {idx > 0 ? ' ' : null}
                                      <span
                                        className={`transcript-panel__word${isWordActive ? ' transcript-panel__word--active' : ''}${wordClickable ? ' transcript-panel__word--clickable' : ''}`}
                                        aria-current={isWordActive ? 'true' : undefined}
                                        data-word-start={w.start}
                                        data-word-end={w.end}
                                        onClick={wordClickable ? (e) => handleWordClick(e, w) : undefined}
                                      >
                                        {w.word}
                                      </span>
                                    </React.Fragment>
                                  );
                                })}
                              </span>
                            );
                            Object.entries(highlightBoundaries).forEach(([hid, b]) => {
                              if (hid !== r.highlightId) return;
                              if (b.last?.lineIdx === i && b.last?.wordIdx === lastWi) {
                                wordNodes.push(
                                  <span
                                    key={`out-${hid}`}
                                    className={`transcript-panel__handle transcript-panel__handle--out${isAccepted ? ' transcript-panel__handle--accepted' : ''}`}
                                    role="slider"
                                    tabIndex={0}
                                    aria-label={`Highlight ${b.ordinal} out point. Drag to adjust.`}
                                    aria-valuenow={highlights.find((h) => h.id === hid)?.out}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onHighlightDragStart?.();
                                      setDraggingHandle({ highlightId: hid, inOrOut: 'out' });
                                    }}
                                  />
                                );
                              }
                            });
                          } else {
                            r.wordIndices.forEach((wi, idx) => {
                              const w = words[wi];
                              const isWordActive =
                                currentTime != null && currentTime >= w.start && currentTime < w.end;
                              const wordClickable = isClickable && w.start != null;
                              if (idx > 0) wordNodes.push(<span key={`s-${i}-${wi}`} className="transcript-panel__word-gap"> </span>);
                              wordNodes.push(
                                <span
                                  key={`w-${i}-${wi}`}
                                  className={`transcript-panel__word${isWordActive ? ' transcript-panel__word--active' : ''}${wordClickable ? ' transcript-panel__word--clickable' : ''}`}
                                  aria-current={isWordActive ? 'true' : undefined}
                                  data-word-start={w.start}
                                  data-word-end={w.end}
                                  onClick={wordClickable ? (e) => handleWordClick(e, w) : undefined}
                                >
                                  {w.word}
                                </span>
                              );
                            });
                          }
                        });
                      }
                      const firstWord = words[0];
                      const lineSpeakerId = firstWord?.speaker_id != null ? Number(firstWord.speaker_id) : 0;
                      const lineSpeakerName = getSpeakerDisplayName(lineSpeakerId, speakerLabels);

                      return (
                        <li
                          key={`${line.start ?? line.time ?? i}-${i}`}
                          ref={isActive ? activeLineRef : undefined}
                          className={`transcript-panel__line${isClickable ? ' transcript-panel__line--clickable' : ''}`}
                          onClick={isClickable ? () => handleLineClick(line) : undefined}
                          onKeyDown={
                            isClickable
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleLineClick(line);
                                  }
                                }
                              : undefined
                          }
                          role={isClickable ? 'button' : undefined}
                          tabIndex={isClickable ? 0 : undefined}
                        >
                          <div className={`transcript-panel__line-inner${speakerIds.length > 0 ? ' transcript-panel__line-inner--with-speaker' : ''}`}>
                            {speakerIds.length > 0 && (
                              editingSpeakerId === lineSpeakerId && editingLineIndex === i ? (
                                <input
                                  type="text"
                                  className="transcript-panel__speaker-edit-input"
                                  value={editingSpeakerValue}
                                  onChange={(e) => setEditingSpeakerValue(e.target.value)}
                                  onBlur={() => {
                                    const val = editingSpeakerValue.trim();
                                    if (selectedMediaId != null && typeof onSpeakerLabelChange === 'function') {
                                      onSpeakerLabelChange(selectedMediaId, { [String(lineSpeakerId)]: val || getSpeakerDisplayName(lineSpeakerId, speakerLabels) });
                                    }
                                    setEditingSpeakerId(null);
                                    setEditingLineIndex(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.target.blur();
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingSpeakerValue(getSpeakerDisplayName(lineSpeakerId, speakerLabels));
                                      setEditingSpeakerId(null);
                                      setEditingLineIndex(null);
                                      e.target.blur();
                                    }
                                  }}
                                  autoFocus
                                  aria-label={`Edit name for speaker ${lineSpeakerId + 1}`}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="transcript-panel__speaker-chip"
                                  onClick={(e) => e.stopPropagation()}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSpeakerId(lineSpeakerId);
                                    setEditingSpeakerValue(getSpeakerDisplayName(lineSpeakerId, speakerLabels));
                                    setEditingLineIndex(i);
                                  }}
                                  aria-label={`${lineSpeakerName}. Double-click to edit.`}
                                >
                                  {lineSpeakerName}
                                </button>
                              )
                            )}
                            <span className="transcript-panel__time" aria-hidden="true">
                              {lineTime(line)}
                            </span>
                            <span className="transcript-panel__text">
                              {hasLeadingPill && wordNodes.length >= 2 ? (
                                <>
                                  <span className="transcript-panel__highlight-prefix">
                                    {wordNodes[0]}
                                    {wordNodes[1]}
                                  </span>
                                  <span className="transcript-panel__text-flow">
                                    {wordNodes.slice(2)}
                                  </span>
                                </>
                              ) : (
                                wordNodes
                              )}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              </div>
            </div>
          </div>
          <div
            id="transcript-panel-tab-clipinfo"
            role="tabpanel"
            aria-labelledby="tab-clipinfo"
            hidden={activeTab !== 'clipinfo'}
            className="transcript-panel__tab-panel"
          >
            <div className="transcript-panel__placeholder">Clip info content coming soon.</div>
          </div>

          {/* Footer: when all clips accepted or deleted, one primary button; else Delete + Accept */}
          <div className={`transcript-panel__footer ${allDecided ? 'transcript-panel__footer--single' : ''}`}>
            {allDecided ? (
              <Button variant="primary" onClick={onProceedToReviewTimeline} className="transcript-panel__continue-btn">
                Proceed to review timeline
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (hasMultiSelection && typeof onDeleteSelection === 'function') {
                      onDeleteSelection(selectedRowIndices);
                    } else if (selectedHighlightId != null && typeof onRemoveHighlight === 'function') {
                      handleRequestDeleteHighlight(selectedHighlightId);
                    } else if (selectedSelectId != null && onDelete) {
                      onDelete(selectedSelectId);
                    }
                  }}
                  disabled={
                    selectedCount === 0 && selectedSelectId == null
                      ? true
                      : hasMultiSelection
                        ? false
                        : selectedHighlightId != null
                          ? false
                          : !selectedIsPending
                  }
                >
                  {hasMultiSelection ? `Delete [${selectedCount}]` : 'Delete'}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (hasMultiSelection && typeof onAcceptSelection === 'function') {
                      onAcceptSelection(selectedRowIndices);
                    } else {
                      onAccept?.(selectedSelectId ?? null, selectedHighlightId ?? null);
                    }
                  }}
                  disabled={
                    selectedCount === 0 && selectedSelectId == null
                      ? true
                      : hasMultiSelection
                        ? !hasAnyPendingInSelection
                        : selectedSelectId != null
                          ? !selectedIsPending
                          : false
                  }
                >
                  {hasMultiSelection
                    ? `Accept Highlight(s) [${selectedCount}]`
                    : selectedHighlightId != null
                      ? 'Accept Highlight'
                      : 'Accept All'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TranscriptPanel;
