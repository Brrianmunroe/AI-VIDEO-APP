import React from 'react';
import Icon from './Icon';
import './styles/HighlightContainer.css';

/**
 * HighlightContainer Component
 * 
 * Matches the Figma "Highlight Container" component (node 403:2158).
 * Row: thumbnail + clip name + highlight count + info icon.
 * 5 states: default, hover, selected, disabled, focused
 * 
 * @param {string} thumbnail - URL for the clip thumbnail
 * @param {string} clipName - Clip filename (e.g., "clip_0002.mp4")
 * @param {number} highlightCount - Number of highlights
 * @param {boolean} selected - Whether the item is selected
 * @param {boolean} disabled - Whether the item is disabled
 * @param {string} status - 'pending' | 'accepted' (accepted shows "Accepted" in success green)
 * @param {function} onClick - Click handler
 * @param {function} onInfoClick - Click handler for info icon
 * @param {string} className - Additional CSS classes
 */
function HighlightContainer({
  thumbnail,
  clipName = '',
  highlightCount = 0,
  selected = false,
  disabled = false,
  status = 'pending',
  onClick,
  onInfoClick,
  className = '',
}) {
  const classes = [
    'highlight',
    selected ? 'highlight--selected' : '',
    disabled ? 'highlight--disabled' : '',
    status === 'accepted' ? 'highlight--accepted' : '',
    className,
  ].filter(Boolean).join(' ');

  const handleInfoClick = (e) => {
    e.stopPropagation();
    onInfoClick?.();
  };

  return (
    <div
      className={classes}
      onClick={!disabled ? onClick : undefined}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <div className="highlight__thumbnail">
        {thumbnail && <img src={thumbnail} alt="" className="highlight__img" />}
      </div>
      <div className="highlight__info">
        <span className="highlight__name">{clipName}</span>
        <span className="highlight__count">
          {status === 'accepted' ? 'Accepted' : `${highlightCount} Highlight${highlightCount !== 1 ? 's' : ''}`}
        </span>
      </div>
      <button
        className="highlight__action"
        onClick={handleInfoClick}
        disabled={disabled}
        type="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="More info"
      >
        <Icon
          type="info"
          size="sm"
          state={disabled ? 'disabled' : 'primary'}
        />
      </button>
    </div>
  );
}

export default HighlightContainer;
