import React, { useState } from 'react';
import Button from './Button';
import Icon from './Icon';
import './styles/ExportTimelineModal.css';

const PLATFORMS = [
  { id: 'premiere', label: 'Adobe Premiere Pro', description: 'FCP XML + Media package — File → Import in Premiere' },
  { id: 'resolve', label: 'DaVinci Resolve', description: 'Coming soon' },
  { id: 'finalcut', label: 'Final Cut Pro', description: 'Coming soon' },
];

function ExportTimelineModal({ isOpen, onClose, onExport, videoClips = [], durationFrames = 0 }) {
  const [selectedPlatform, setSelectedPlatform] = useState('premiere');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    const result = onExport?.(selectedPlatform, { videoClips, durationFrames });
    const promise = result != null && typeof result.then === 'function' ? result : Promise.resolve();
    setIsExporting(true);
    try {
      await promise;
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <>
      <div className="export-modal-backdrop" onClick={handleCancel} aria-hidden="true" />
      <div
        className="export-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-modal-header">
          <h2 id="export-modal-title" className="export-modal-title">
            Export timeline
          </h2>
          <button
            className="export-modal-close"
            onClick={handleCancel}
            aria-label="Close"
            type="button"
          >
            <Icon type="close" size="sm" state="primary" />
          </button>
        </div>

        <div className="export-modal-body">
          <p className="export-modal-description">
            Choose where to export your timeline. The sequence will include your approved selects in order.
          </p>
          <fieldset className="export-platform-list" aria-label="Export platform">
            {PLATFORMS.map((platform) => {
              const isSelected = selectedPlatform === platform.id;
              const isDisabled = platform.id !== 'premiere';
              return (
                <label
                  key={platform.id}
                  className={`export-platform-option ${isSelected ? 'export-platform-option--selected' : ''} ${isDisabled ? 'export-platform-option--disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="export-platform"
                    value={platform.id}
                    checked={isSelected}
                    onChange={() => !isDisabled && setSelectedPlatform(platform.id)}
                    disabled={isDisabled}
                    className="export-platform-option__input"
                    aria-describedby={`export-desc-${platform.id}`}
                  />
                  <span className="export-platform-option__label">{platform.label}</span>
                  <span id={`export-desc-${platform.id}`} className="export-platform-option__description">
                    {platform.description}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>

        <div className="export-modal-footer">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={selectedPlatform !== 'premiere' || isExporting}
          >
            {isExporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>
    </>
  );
}

export default ExportTimelineModal;
