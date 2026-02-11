import React, { useState } from 'react';
import Icon from './Icon';
import './styles/MediaFileCard.css';

function MediaFileCard({ 
  media, 
  isMasterAudio, 
  onSelect, 
  onClipNameChange 
}) {
  const [clipName, setClipName] = useState(media.clipName || media.name || media.filePath?.split('/').pop() || '');

  const handleClipNameChange = (e) => {
    const newName = e.target.value;
    setClipName(newName);
    if (onClipNameChange) {
      onClipNameChange(media.id, newName);
    }
  };

  const handleClick = () => {
    if (onSelect) {
      onSelect(media.id);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isVideo = media.type === 'video' || media.file_path?.match(/\.(mp4|mov|avi|mkv|m4v)$/i);
  const isAudio = media.type === 'audio' || media.file_path?.match(/\.(mp3|wav|aac|m4a|flac)$/i);

  return (
    <div 
      className={`media-file-card ${isMasterAudio ? 'master-audio-selected' : ''}`}
      onClick={handleClick}
    >
      <div className="media-thumbnail">
        {isVideo ? (
          <div className="video-thumbnail">
            <div className="thumbnail-placeholder">
              <Icon type="camera" size="lg" state="primary" />
            </div>
          </div>
        ) : isAudio ? (
          <div className="audio-waveform">
            <div className="waveform-placeholder">
              <div className="waveform-bar" style={{ height: '20%' }}></div>
              <div className="waveform-bar" style={{ height: '60%' }}></div>
              <div className="waveform-bar" style={{ height: '40%' }}></div>
              <div className="waveform-bar" style={{ height: '80%' }}></div>
              <div className="waveform-bar" style={{ height: '30%' }}></div>
              <div className="waveform-bar" style={{ height: '70%' }}></div>
              <div className="waveform-bar" style={{ height: '50%' }}></div>
              <div className="waveform-bar" style={{ height: '90%' }}></div>
            </div>
          </div>
        ) : (
          <div className="thumbnail-placeholder">
            <Icon type="info" size="lg" state="primary" />
          </div>
        )}
        
        {/* Type icon */}
        <div className="type-icon">
          {isVideo ? (
            <Icon type="camera" size="sm" state="secondary" />
          ) : isAudio ? (
            <Icon type="audio" size="sm" state="secondary" />
          ) : (
            <Icon type="info" size="sm" state="secondary" />
          )}
        </div>
        
        {/* Duration overlay */}
        {media.duration && (
          <div className="duration-overlay">
            {formatDuration(media.duration)}
          </div>
        )}
        
        {/* Master Audio indicator */}
        {isMasterAudio && (
          <div className="master-audio-indicator">
            <Icon type="crown" size="sm" state="selected" />
          </div>
        )}
      </div>
      
      {/* Clip name input */}
      <input
        type="text"
        className="clip-name-input"
        value={clipName}
        onChange={handleClipNameChange}
        onClick={(e) => e.stopPropagation()}
        placeholder="Clip Name"
      />
    </div>
  );
}

export default MediaFileCard;
