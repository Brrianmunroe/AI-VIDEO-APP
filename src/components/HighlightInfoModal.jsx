import React, { useRef } from 'react';
import Icon from './Icon';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './styles/HighlightInfoModal.css';

const FALLBACK = 'No explanation available for this highlight.';

/**
 * Modal that shows "Why we selected this" and "How you might use it" for a highlight.
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {{ clipName?: string, ordinal?: number, reason?: string, suggestions?: string }} highlight
 */
function HighlightInfoModal({ isOpen, onClose, highlight }) {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, isOpen);

  if (!isOpen) return null;

  const reason = highlight?.reason?.trim() ?? '';
  const suggestions = highlight?.suggestions?.trim() ?? '';
  const hasAny = reason || suggestions;
  const title =
    highlight?.ordinal != null && highlight.ordinal > 0
      ? `${highlight.clipName || 'Clip'} — Highlight ${highlight.ordinal}`
      : 'Highlight explanation';

  return (
    <>
      <div
        className="highlight-info-modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className="highlight-info-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="highlight-info-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="highlight-info-modal-header">
          <h2 id="highlight-info-modal-title" className="highlight-info-modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="highlight-info-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon type="close" size="sm" state="primary" />
          </button>
        </div>
        <div className="highlight-info-modal-body">
          {hasAny ? (
            <>
              <section className="highlight-info-modal-section">
                <h3 className="highlight-info-modal-label">Why we selected this</h3>
                <p className="highlight-info-modal-text">
                  {reason || FALLBACK}
                </p>
              </section>
              <section className="highlight-info-modal-section">
                <h3 className="highlight-info-modal-label">How you might use it</h3>
                <p className="highlight-info-modal-text">
                  {suggestions || FALLBACK}
                </p>
              </section>
            </>
          ) : (
            <p className="highlight-info-modal-text">{FALLBACK}</p>
          )}
        </div>
      </div>
    </>
  );
}

export default HighlightInfoModal;
