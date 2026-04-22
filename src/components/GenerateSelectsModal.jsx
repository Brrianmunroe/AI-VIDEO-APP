import React, { useState, useEffect } from 'react';
import Button from './Button';
import Icon from './Icon';
import './styles/GenerateSelectsModal.css';

function GenerateSelectsModal({
  isOpen,
  onClose,
  onCreate,
  onSkip,
  mode = 'create',
  initialStoryContext = '',
}) {
  const isRecut = mode === 'recut';
  const [storyContext, setStoryContext] = useState(initialStoryContext || '');

  // Seed the textarea with the prefilled context each time the modal is opened so re-cuts
  // start from the last prompt used. When closed, reset to the next prefill value.
  useEffect(() => {
    if (isOpen) {
      setStoryContext(initialStoryContext || '');
    } else {
      setStoryContext('');
    }
  }, [isOpen, initialStoryContext]);

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

  const title = isRecut ? 'Re-cut Selects' : 'Context Brief';
  const description = isRecut
    ? 'Tweak the story context and the AI will regenerate highlights as a new version.'
    : 'Describe the story and any context that will shape the video.';
  const primaryLabel = isRecut ? 'Re-cut' : 'Create';

  return (
    <>
      <div className="modal-backdrop" onClick={handleCancel} />
      <div className="modal-container modal-container--scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header__row">
            <h2 className="modal-title">{title}</h2>
            <button className="modal-close" onClick={handleCancel} aria-label="Close">
              <Icon type="close" size="sm" state="primary" />
            </button>
          </div>
          <p className="modal-description modal-description--context-brief">
            {description}
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

        <div className={isRecut ? 'modal-footer' : 'modal-footer modal-footer--split'}>
          {!isRecut && (
            <Button variant="ghost" onClick={handleSkip}>
              Skip
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleCreate}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

export default GenerateSelectsModal;
