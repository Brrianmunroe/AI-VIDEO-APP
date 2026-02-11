import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Icon from './Icon';
import Button from './Button';
import HighlightContainer from './HighlightContainer';
import './styles/TranscriptPanel.css';

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

const TABS = [
  { id: 'interview', label: 'Interview Selects' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'clipinfo', label: 'Clip info' },
];

function TranscriptPanel({
  transcript = [],
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
}) {
  const selects = Array.isArray(selectsProp) ? selectsProp : [];
  const transcriptList = Array.isArray(transcript) ? transcript : [];
  /** Show only pending and accepted with valid id; deleted clips disappear from the list */
  const visibleSelects = selects.filter((s) => s != null && s.id != null && s.status !== 'deleted');
  const selectedClip = visibleSelects.find((s) => s.id === selectedSelectId);
  const selectedIsPending = selectedClip?.status === 'pending';
  const [activeTab, setActiveTab] = useState('interview');
  const [search, setSearch] = useState('');
  const activeLineRef = useRef(null);

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

  const currentTime = currentTimeSec != null ? Number(currentTimeSec) : null;
  const activeLineIndex = useMemo(() => {
    if (currentTime == null || transcriptList.length === 0) return -1;
    const idx = transcriptList.findIndex(
      (line) => line != null && line.start != null && line.end != null && currentTime >= line.start && currentTime < line.end
    );
    return idx;
  }, [transcriptList, currentTime]);

  useEffect(() => {
    if (activeLineIndex >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeLineIndex]);

  const handleLineClick = useCallback(
    (line) => {
      if (line.start != null && typeof onSeek === 'function') {
        onSeek(line.start);
      }
    },
    [onSeek]
  );

  const showNoTranscript = transcriptList.length === 0 && selectedSelectId != null;
  const showSelectClip = selectedSelectId == null;

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
              <div className="transcript-panel__content">
                {showSelectClip && (
                  <div className="transcript-panel__placeholder">
                    Select a clip to view transcript and playback.
                  </div>
                )}
                {showNoTranscript && (
                  <div className="transcript-panel__placeholder">
                    No transcript for this clip.
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
                      return (
                        <li
                          key={`${line.start ?? line.time ?? i}-${i}`}
                          ref={isActive ? activeLineRef : undefined}
                          className={`transcript-panel__line${isActive ? ' transcript-panel__line--active' : ''}${isClickable ? ' transcript-panel__line--clickable' : ''}`}
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
                          <span className="transcript-panel__text">{line.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
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
