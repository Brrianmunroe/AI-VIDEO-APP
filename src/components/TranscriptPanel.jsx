import React, { useState, useMemo } from 'react';
import Icon from './Icon';
import Button from './Button';
import HighlightContainer from './HighlightContainer';
import './styles/TranscriptPanel.css';

/** Mock transcript lines until API exists (extended for scroll testing) */
const MOCK_TRANSCRIPT = [
  { time: '0:00', text: 'Welcome to the interview. Can you tell us about your background?' },
  { time: '0:08', text: 'Sure. I started in design about ten years ago.' },
  { time: '0:14', text: 'Initially I was focused on print, then moved into digital.' },
  { time: '0:22', text: 'What drew you to video editing specifically?' },
  { time: '0:28', text: 'The combination of story and rhythm. Every cut changes the meaning.' },
  { time: '0:36', text: "That's a great way to put it. How do you approach a new project?" },
  { time: '0:44', text: 'I always start with the transcript and the emotional beats.' },
  { time: '0:52', text: 'Then I build the timeline around those moments.' },
  { time: '1:00', text: 'Can you walk us through a typical edit from start to finish?' },
  { time: '1:08', text: 'I start by watching everything and making notes on paper.' },
  { time: '1:16', text: 'Then I do a rough cut without overthinking it.' },
  { time: '1:24', text: 'The second pass is where I refine the rhythm and pacing.' },
  { time: '1:32', text: 'How do you decide when to cut on action versus dialogue?' },
  { time: '1:40', text: 'It depends on the energy. Action wants to breathe; dialogue can be tighter.' },
  { time: '1:48', text: 'What role does music play in your process?' },
  { time: '1:56', text: 'I often cut to a temp track, then the final score changes everything.' },
  { time: '2:04', text: 'Do you prefer working alone or with a director in the room?' },
  { time: '2:12', text: 'A bit of both. I need focus time, then feedback loops.' },
  { time: '2:20', text: "What's the hardest part of editing for you?" },
  { time: '2:28', text: "Killing your darlings. You have to let go of what doesn't serve the story." },
  { time: '2:36', text: 'Any advice for someone just starting out in editing?' },
  { time: '2:44', text: 'Edit a lot. Short films, reels, anything. Quantity teaches you rhythm.' },
  { time: '2:52', text: 'How do you handle client feedback that you disagree with?' },
  { time: '3:00', text: "I try to understand the note behind the note. Usually it's about clarity or tone." },
  { time: '3:08', text: 'What tools do you use day to day?' },
  { time: '3:16', text: 'Premiere for most projects; sometimes Resolve for color and finish.' },
  { time: '3:24', text: 'Do you think AI will change editing in the next few years?' },
  { time: '3:32', text: "It'll handle more of the mechanical work. The creative choices will still be human." },
  { time: '3:40', text: 'Thanks so much for your time today.' },
  { time: '3:48', text: 'Happy to share. Good luck with the project.' },
];

const TABS = [
  { id: 'interview', label: 'Interview Selects' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'clipinfo', label: 'Clip info' },
];

/** Mock AI-cut clips until selects API exists (clip item shape: id, thumbnail, clipName, highlightCount, selectionReason?) */
const MOCK_SELECTS = [
  { id: '1', thumbnail: 'https://picsum.photos/seed/clip1/320/180', clipName: 'clip_0001.mp4', highlightCount: 3 },
  { id: '2', thumbnail: 'https://picsum.photos/seed/clip2/320/180', clipName: 'clip_0002.mp4', highlightCount: 5 },
  { id: '3', thumbnail: 'https://picsum.photos/seed/clip3/320/180', clipName: 'clip_0003.mp4', highlightCount: 2 },
  { id: '4', thumbnail: 'https://picsum.photos/seed/clip4/320/180', clipName: 'clip_0004.mp4', highlightCount: 4 },
  { id: '5', thumbnail: 'https://picsum.photos/seed/clip5/320/180', clipName: 'clip_0005.mp4', highlightCount: 1 },
];

function TranscriptPanel({
  transcript = MOCK_TRANSCRIPT,
  selects: selectsProp,
  selectedSelectId,
  onSelectClip,
  onSelectInfo,
  className = '',
  onDelete,
  onAccept,
  onProceedToReviewTimeline,
  allDecided = false,
}) {
  const selects = selectsProp ?? MOCK_SELECTS;
  /** Show only pending and accepted; deleted clips disappear from the list */
  const visibleSelects = selects.filter((s) => s.status !== 'deleted');
  const selectedClip = visibleSelects.find((s) => s.id === selectedSelectId);
  const selectedIsPending = selectedClip?.status === 'pending';
  const [activeTab, setActiveTab] = useState('interview');
  const [search, setSearch] = useState('');

  const filteredLines = useMemo(() => {
    if (!search.trim()) return transcript;
    const q = search.trim().toLowerCase();
    return transcript.filter(
      (line) => line.text.toLowerCase().includes(q) || line.time.includes(q)
    );
  }, [transcript, search]);

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
                <ul className="transcript-panel__lines" aria-label="Transcript lines">
                  {filteredLines.map((line, i) => (
                    <li key={`${line.time}-${i}`} className="transcript-panel__line">
                      <span className="transcript-panel__time" aria-hidden="true">
                        {line.time}
                      </span>
                      <span className="transcript-panel__text">{line.text}</span>
                    </li>
                  ))}
                </ul>
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
