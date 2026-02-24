import React, { useState, useEffect } from 'react';
import Button from './Button';
import Icon from './Icon';
import DropDown from './DropDown';
import './styles/GenerateSelectsModal.css';

const DURATION_OPTIONS = [
  { value: 15, label: '15 sec' },
  { value: 30, label: '30 sec' },
  { value: 45, label: '45 sec' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 240, label: '4 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '5 min+' },
];

function GenerateSelectsModal({ isOpen, onClose, onCreate, onSkip }) {
  const [storyContext, setStoryContext] = useState('');
  const [desiredDurationSec, setDesiredDurationSec] = useState(120);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStoryContext('');
      setDesiredDurationSec(120);
    }
  }, [isOpen]);

  const handleCreate = () => {
    onCreate({
      storyContext: storyContext.trim(),
      desiredDurationSec,
    });
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip({ desiredDurationSec });
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
          <p className="modal-description">
            For better results provide a brief of what you are looking for. Include story, pace, and style.
          </p>
        </div>

        <div className="modal-body modal-body--scrollable">
          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Story Context</label>
            <textarea
              className="form-field__textarea"
              placeholder="What this piece is about, key messages, pace, style, audience, and any specific instructions..."
              value={storyContext}
              onChange={(e) => setStoryContext(e.target.value)}
              rows={6}
            />
          </div>

          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <DropDown
              label="Desired Video Length"
              options={DURATION_OPTIONS}
              value={desiredDurationSec}
              onChange={(v) => setDesiredDurationSec(Number(v))}
              placeholder="2 min"
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
