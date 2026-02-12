import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
    if (first != null && last != null) boundaries[h.id] = { first, last, ordinal: index + 1 };
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
      return { id: h.id, ordinal: i + 1 };
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
  }));
}

const TABS = [
  { id: 'interview', label: 'Interview Selects' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'clipinfo', label: 'Clip info' },
];

function TranscriptPanel({
  transcript = [],
  transcriptEmptyReason = null,
  transcriptionErrors = [],
  currentTimeSec,
  onSeek,
  selects: selectsProp = [],
  selectedSelectId,
  onSelectClip,
  onSelectInfo,
  className = '',
  onDelete,
  onAccept,
  onProceedToReviewTimeline,
  allDecided = false,
  highlights: highlightsProp = [],
  onHighlightsChange,
  onAddHighlightFromSelection,
}) {
  const selects = Array.isArray(selectsProp) ? selectsProp : [];
  const transcriptList = Array.isArray(transcript) ? transcript : [];
  const highlights = Array.isArray(highlightsProp) ? highlightsProp : [];
  /** Show only pending and accepted with valid id; deleted clips disappear from the list */
  const visibleSelects = selects.filter((s) => s != null && s.id != null && s.status !== 'deleted');
  const selectedClip = visibleSelects.find((s) => s.id === selectedSelectId);
  const selectedIsPending = selectedClip?.status === 'pending';
  const [activeTab, setActiveTab] = useState('interview');
  const [search, setSearch] = useState('');
  const activeLineRef = useRef(null);
  const transcriptContentRef = useRef(null);
  const [draggingHandle, setDraggingHandle] = useState(null);

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

  const currentTime = currentTimeSec != null ? Number(currentTimeSec) : null;
  const activeLineIndex = useMemo(() => {
    if (currentTime == null || transcriptList.length === 0) return -1;
    const idx = transcriptList.findIndex(
      (line) => line != null && line.start != null && line.end != null && currentTime >= line.start && currentTime < line.end
    );
    return idx;
  }, [transcriptList, currentTime]);

  useEffect(() => {
    if (activeTab !== 'transcript') return;
    if (activeLineIndex >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTab, activeLineIndex]);

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
    (highlightId, nextIn, nextOut) => {
      if (typeof onHighlightsChange !== 'function' || selectedSelectId == null) return;
      const next = highlights.map((h) =>
        h.id === highlightId ? { ...h, in: nextIn ?? h.in, out: nextOut ?? h.out } : h
      );
      onHighlightsChange(selectedSelectId, next);
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
        applyHighlightInOut(draggingHandle.highlightId, tStart, undefined);
      } else {
        applyHighlightInOut(draggingHandle.highlightId, undefined, tEnd);
      }
    };
    const handleUp = () => setDraggingHandle(null);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [draggingHandle, applyHighlightInOut]);

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
                {visibleSelects.length === 0 ? (
                  <div className="transcript-panel__placeholder">
                    No clips in this project. Upload videos in the Import step.
                  </div>
                ) : (
                  <div className="transcript-panel__selects-list">
                    {visibleSelects.map((item) => (
                      <HighlightContainer
                        key={item.id}
                        thumbnail={item.thumbnail}
                        clipName={item.clipName}
                        highlightCount={item.highlightCount}
                        status={item.status}
                        selected={selectedSelectId === item.id}
                        onClick={() => onSelectClip?.(item.id)}
                        onInfoClick={() => onSelectInfo?.(item.id)}
                      />
                    ))}
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
                            Object.entries(highlightBoundaries).forEach(([hid, b]) => {
                              if (hid !== r.highlightId) return;
                              if (b.first?.lineIdx === i && b.first?.wordIdx === firstWi) {
                                wordNodes.push(
                                  <span key={`ord-${hid}`} className="transcript-panel__ordinal-pill" aria-label={`Highlight ${b.ordinal}`}>
                                    {b.ordinal}
                                  </span>
                                );
                                wordNodes.push(
                                  <span
                                    key={`in-${hid}`}
                                    className="transcript-panel__handle transcript-panel__handle--in"
                                    role="slider"
                                    tabIndex={0}
                                    aria-label={`Highlight ${b.ordinal} in point. Drag to adjust.`}
                                    aria-valuenow={highlights.find((h) => h.id === hid)?.in}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDraggingHandle({ highlightId: hid, inOrOut: 'in' });
                                    }}
                                  />
                                );
                              }
                            });
                            wordNodes.push(
                              <span key={`run-${i}-${runIdx}`} className="transcript-panel__highlight-run">
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
                                    className="transcript-panel__handle transcript-panel__handle--out"
                                    role="slider"
                                    tabIndex={0}
                                    aria-label={`Highlight ${b.ordinal} out point. Drag to adjust.`}
                                    aria-valuenow={highlights.find((h) => h.id === hid)?.out}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
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
                          <span className="transcript-panel__time" aria-hidden="true">
                            {lineTime(line)}
                          </span>
                          <span className="transcript-panel__text">
                            {wordNodes}
                          </span>
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
                  onClick={() => selectedSelectId != null && onDelete?.(selectedSelectId)}
                  disabled={!selectedIsPending}
                >
                  Delete
                </Button>
                <Button
                  variant="primary"
                  onClick={() => selectedSelectId != null && onAccept?.(selectedSelectId)}
                  disabled={!selectedIsPending}
                >
                  Accept
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
