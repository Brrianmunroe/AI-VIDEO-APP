import React, { useState, useEffect } from 'react';
import Button from './Button';
import Icon from './Icon';
import './styles/GenerateSelectsModal.css';

function GenerateSelectsModal({ isOpen, onClose, onCreate, onSkip }) {
  const [storyContext, setStoryContext] = useState('');

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStoryContext('');
    }
  }, [isOpen]);

  const handleCreate = () => {
    onCreate({ storyContext: storyContext.trim() });
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip({});
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={handleCancel} />
      <div className="modal-container modal-container--scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header__row">
            <h2 className="modal-title">Context Brief</h2>
            <button className="modal-close" onClick={handleCancel} aria-label="Close">
              <Icon type="close" size="sm" state="primary" />
            </button>
          </div>
          <p className="modal-description modal-description--context-brief">
            Describe the story and any context that will shape the video.
          </p>
        </div>

        <div className="modal-body modal-body--scrollable modal-body--context-brief">
          <div className="form-field form-field--context-brief" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label form-field__label--context-brief">Story Context</label>
            <textarea
              className="form-field__textarea form-field__textarea--context-brief"
              placeholder="Example: Interview about a founder's journey. Pull strong soundbites on early struggles, the turning point, and the mission today. Keep the pacing tight and highlight emotional moments."
              value={storyContext}
              onChange={(e) => setStoryContext(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        <div className="modal-footer modal-footer--split">
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
          >
            Create
          </Button>
        </div>
      </div>
    </>
  );
}

export default GenerateSelectsModal;
