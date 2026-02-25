import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import './styles/MediaCard.css';

/** Filmstrip icon for video type (16×16) */
function FilmstripIcon({ className }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2 2.66227C2 2.29651 2.27319 2 2.59508 2H13.4049C13.7336 2 14 2.29663 14 2.66227V13.3377C14 13.7035 13.7268 14 13.4049 14H2.59508C2.26643 14 2 13.7034 2 13.3377V2.66227ZM3.2 3.33333V4.66667H4.4V3.33333H3.2ZM11.6 3.33333V4.66667H12.8V3.33333H11.6ZM3.2 6V7.33333H4.4V6H3.2ZM11.6 6V7.33333H12.8V6H11.6ZM3.2 8.66667V10H4.4V8.66667H3.2ZM11.6 8.66667V10H12.8V8.66667H11.6ZM3.2 11.3333V12.6667H4.4V11.3333H3.2ZM11.6 11.3333V12.6667H12.8V11.3333H11.6Z"
        fill="var(--color-icon-selected)"
      />
    </svg>
  );
}

/**
 * MediaCard Component
 * 
 * Matches the Figma "Media Modal" component (node 403:1951).
 * 3 types: video (thumbnail + filmstrip icon + duration),
 *          add-media (+ icon placeholder),
 *          audio (waveform + music icon + duration)
 * 5 states: default, hover, selected, disabled, focused
 * 
 * @param {string} type - 'video' | 'add-media' | 'audio'
 * @param {string} thumbnail - URL for video thumbnail image
 * @param {string} duration - Duration string (e.g., "1:19")
 * @param {string} clipName - Clip name to display below the card
 * @param {string} id - Optional media id for onClipNameChange
 * @param {function} onClipNameChange - (id, newName) when clip name is edited
 * @param {boolean} selected - Whether the card is selected
 * @param {boolean} disabled - Whether the card is disabled
 * @param {function} onClick - Click handler
 * @param {function} onDelete - (id) remove this clip from project (video/audio only)
 * @param {string} className - Additional CSS classes
 */
function MediaCard({
  type = 'video',
  thumbnail,
  duration,
  clipName,
  id,
  onClipNameChange,
  selected = false,
  disabled = false,
  onClick,
  onDelete,
  className = '',
}) {
  const [isEditingClipName, setIsEditingClipName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState(clipName || '');
  const clipNameInputRef = useRef(null);

  useEffect(() => {
    if (isEditingClipName && clipNameInputRef.current) {
      clipNameInputRef.current.focus();
      clipNameInputRef.current.select();
    }
  }, [isEditingClipName]);

  useEffect(() => {
    setEditingNameValue(clipName || '');
  }, [clipName]);

  const handleClipNameDoubleClick = (e) => {
    e.stopPropagation();
    if (disabled || !onClipNameChange || id == null) return;
    setEditingNameValue(clipName || '');
    setIsEditingClipName(true);
  };

  const commitClipNameEdit = () => {
    if (onClipNameChange && id != null) {
      const trimmed = (editingNameValue || '').trim();
      onClipNameChange(id, trimmed || clipName || '');
    }
    setIsEditingClipName(false);
  };

  const handleClipNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitClipNameEdit();
    }
    if (e.key === 'Escape') {
      setEditingNameValue(clipName || '');
      setIsEditingClipName(false);
      clipNameInputRef.current?.blur();
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (disabled || !onDelete || id == null) return;
    onDelete(id);
  };

  const handleCardKeyDown = (e) => {
    if (disabled || !onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const classes = [
    'media-card',
    `media-card--${type}`,
    selected ? 'media-card--selected' : '',
    disabled ? 'media-card--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  const iconState = disabled ? 'disabled' : 'primary';

  return (
    <div className="media-card-wrapper">
      <div
        className={classes}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={type === 'add-media' ? 'Add footage' : undefined}
        onClick={!disabled ? onClick : undefined}
        onKeyDown={handleCardKeyDown}
      >
        {/* Video type: shows thumbnail with filmstrip icon + duration (bottom-left icon, bottom-right duration, 12px inset) */}
        {type === 'video' && (
          <>
            <div className="media-card__thumbnail">
              {thumbnail && <img src={thumbnail} alt="" className="media-card__img" />}
            </div>
            <div className="media-card__gradient" aria-hidden="true" />
            <div className="media-card__overlay">
              <FilmstripIcon className="media-card__type-icon" />
              <span className="media-card__duration">{duration ?? '0:00'}</span>
            </div>
            {onDelete && id != null && (
              <button
                type="button"
                className="media-card__delete"
                onClick={handleDeleteClick}
                aria-label="Remove clip from project"
                title="Remove clip"
              >
                <Icon type="close" size="sm" state="primary" />
              </button>
            )}
          </>
        )}

        {/* Add-media type: shows add icon (frame + plus) centered */}
        {type === 'add-media' && (
          <div className="media-card__add">
            <svg
              className="media-card__add-icon"
              width="44"
              height="44"
              viewBox="0 0 44 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path d="M7.33333 5.5H36.6667C37.6792 5.5 38.5 6.32082 38.5 7.33333V36.6667C38.5 37.6792 37.6792 38.5 36.6667 38.5H7.33333C6.32082 38.5 5.5 37.6792 5.5 36.6667V7.33333C5.5 6.32082 6.32082 5.5 7.33333 5.5ZM20.1667 20.1667H12.8333V23.8333H20.1667V31.1667H23.8333V23.8333H31.1667V20.1667H23.8333V12.8333H20.1667V20.1667Z" fill="var(--color-icon-primary)" stroke="none" />
            </svg>
          </div>
        )}

        {/* Audio type: shows waveform area with music icon + duration */}
        {type === 'audio' && (
          <>
            <div className="media-card__waveform">
              <div className="media-card__waveform-bars" />
            </div>
            <div className="media-card__overlay">
              <Icon type="audio" size="sm" state={iconState} className="media-card__type-icon" />
              <span className="media-card__duration">{duration ?? '0:00'}</span>
            </div>
            {onDelete && id != null && (
              <button
                type="button"
                className="media-card__delete"
                onClick={handleDeleteClick}
                aria-label="Remove clip from project"
                title="Remove clip"
              >
                <Icon type="close" size="sm" state="primary" />
              </button>
            )}
          </>
        )}
      </div>
      {/* Clip name below the card: single line, double-click to edit */}
      {clipName != null && clipName !== '' && (
        isEditingClipName ? (
          <div className="media-card__clip-name--editing" onClick={(e) => e.stopPropagation()}>
            <input
              ref={clipNameInputRef}
              type="text"
              className="media-card__clip-name-input"
              value={editingNameValue}
              onChange={(e) => setEditingNameValue(e.target.value)}
              onBlur={commitClipNameEdit}
              onKeyDown={handleClipNameKeyDown}
              onClick={(e) => e.stopPropagation()}
              aria-label="Clip name"
            />
          </div>
        ) : (
          <div
            className="media-card__clip-name"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleClipNameDoubleClick}
            title={onClipNameChange && id != null ? 'Double-click to rename' : undefined}
          >
            {clipName}
          </div>
        )
      )}
    </div>
  );
}

export default MediaCard;
