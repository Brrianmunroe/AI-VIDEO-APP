import React, { useState, useEffect } from 'react';
import Button from './Button';
import Icon from './Icon';
import './styles/GenerateSelectsModal.css';

const DURATION_OPTIONS = [
  { value: 15, label: '15 sec' },
  { value: 30, label: '30 sec' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
];

function GenerateSelectsModal({ isOpen, onClose, onCreate, onSkip }) {
  const [storyContext, setStoryContext] = useState('');
  const [styleContext, setStyleContext] = useState('');
  const [userInstructions, setUserInstructions] = useState('');
  const [desiredDurationSec, setDesiredDurationSec] = useState(120);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStoryContext('');
      setStyleContext('');
      setUserInstructions('');
      setDesiredDurationSec(120);
    }
  }, [isOpen]);

  const handleCreate = () => {
    onCreate({
      storyContext: storyContext.trim(),
      styleContext: styleContext.trim(),
      userInstructions: userInstructions.trim(),
      desiredDurationSec,
    });
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    }
    // Form will be reset by useEffect when modal closes
  };

  const handleCancel = () => {
    // Form will be reset by useEffect when modal closes
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
              placeholder="What this piece is about, key messages, audience..."
              value={storyContext}
              onChange={(e) => setStoryContext(e.target.value)}
              rows={4}
            />
          </div>

          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Style Context</label>
            <textarea
              className="form-field__textarea"
              placeholder="Pace, tone, reference examples..."
              value={styleContext}
              onChange={(e) => setStyleContext(e.target.value)}
              rows={4}
            />
          </div>

          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Additional Instructions</label>
            <textarea
              className="form-field__textarea"
              placeholder="Extra rules for the AI (e.g. only use moments about pricing)"
              value={userInstructions}
              onChange={(e) => setUserInstructions(e.target.value)}
              rows={2}
            />
          </div>

          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Desired Video Length</label>
            <select
              className="form-field__input"
              value={desiredDurationSec}
              onChange={(e) => setDesiredDurationSec(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
