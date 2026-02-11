import React from 'react';
import MediaCard from './MediaCard';
import './styles/MediaGrid.css';

function MediaGrid({ 
  mediaFiles = [], 
  onAddFootage,
  onClipNameChange,
  onDeleteFootage,
}) {
  const formatDuration = (seconds) => {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMediaType = (media) => {
    const path = media.filePath ?? media.file_path ?? '';
    if (media.type === 'video' || /\.(mp4|mov|avi|mkv|m4v)$/i.test(path)) return 'video';
    if (media.type === 'audio' || /\.(mp3|wav|aac|m4a|flac)$/i.test(path)) return 'audio';
    return 'video';
  };

  return (
    <div className="media-grid">
      {/* Upload media card - always first (top-left) */}
      <MediaCard
        type="add-media"
        onClick={onAddFootage}
      />
      {/* Video/audio cards */}
      {mediaFiles.map((media) => {
        const mediaType = getMediaType(media);
        const clipName = media.clipName || media.name || media.filePath?.split('/').pop() || 'Clip Name';
        
        return (
          <MediaCard
            key={media.id}
            id={media.id}
            type={mediaType}
            thumbnail={media.thumbnail}
            duration={formatDuration(Number(media.duration) || 0)}
            clipName={clipName}
            onClipNameChange={onClipNameChange}
            onDelete={onDeleteFootage}
            onClick={() => {
              // Handle click if needed
            }}
          />
        );
      })}
    </div>
  );
}

export default MediaGrid;
