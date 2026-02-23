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
 * @param {number} [highlightOrdinal] - When set, show "Highlight N" instead of "N Highlights"
 * @param {boolean} selected - Whether the item is selected
 * @param {boolean} disabled - Whether the item is disabled
 * @param {string} status - 'pending' | 'accepted' (accepted shows "Accepted" in success green)
 * @param {function} onClick - Click handler
 * @param {function} onInfoClick - Click handler for info icon
 * @param {boolean} [showInfoButton=true] - When false, hide the info icon (e.g. for rows with no highlight)
 * @param {boolean} [isDeleting=false] - When true, shows delete animation
 * @param {string} className - Additional CSS classes
 */
function HighlightContainer({
  thumbnail,
  clipName = '',
  highlightCount = 0,
  highlightOrdinal,
  selected = false,
  disabled = false,
  status = 'pending',
  isDeleting = false,
  onClick,
  onInfoClick,
  showInfoButton = true,
  className = '',
}) {
  const classes = [
    'highlight',
    selected ? 'highlight--selected' : '',
    disabled ? 'highlight--disabled' : '',
    status === 'accepted' ? 'highlight--accepted' : '',
    isDeleting ? 'highlight--deleting' : '',
    className,
  ].filter(Boolean).join(' ');

  const handleInfoClick = (e) => {
    e.stopPropagation();
    onInfoClick?.();
  };

  return (
    <div
      className={classes}
      onClick={!disabled && !isDeleting ? onClick : undefined}
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
          {status === 'accepted'
            ? 'Accepted'
            : highlightOrdinal != null
              ? `Highlight ${highlightOrdinal}`
              : `${highlightCount} Highlight${highlightCount !== 1 ? 's' : ''}`}
        </span>
      </div>
      {showInfoButton && (
        <button
          className="highlight__action"
          onClick={handleInfoClick}
          disabled={disabled}
          type="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Show why this was selected and how to use it"
        >
          <Icon
            type="info"
            size="sm"
            state={disabled ? 'disabled' : 'primary'}
          />
        </button>
      )}
    </div>
  );
}

export default HighlightContainer;
