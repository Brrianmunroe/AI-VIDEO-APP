import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import './styles/GenerateSelectsLoading.css';

const STEPS = [
  { id: 'transcribing', label: 'Transcribing audio' },
  { id: 'preparing', label: 'Preparing transcripts' },
  { id: 'analyzing', label: 'Analyzing with AI' },
  { id: 'refining', label: 'Refining selections' },
  { id: 'saving', label: 'Saving highlights' },
];

const FALLBACK_STEP_MS = 800;

function GenerateSelectsLoading({ workPromise, onComplete, onError, onBack }) {
  const [progress, setProgress] = useState(0);
  const [stepStatuses, setStepStatuses] = useState(STEPS.map(() => 'pending'));
  const [error, setError] = useState(null);
  const rafRef = useRef(null);

  // Subscribe to IPC progress when workPromise is provided and Electron API exists
  useEffect(() => {
    if (!workPromise || error) return;
    const api = window.electronAPI?.ai;
    if (typeof api?.onGenerateSelectsProgress !== 'function') return;

    const unsubscribe = api.onGenerateSelectsProgress((payload) => {
      const p = Math.max(0, Math.min(100, Number(payload?.progress) ?? 0));
      setProgress(p);

      const stepIndex = Math.max(0, Math.min(STEPS.length - 1, Number(payload?.stepIndex) ?? 0));
      const isComplete = p >= 100;
      setStepStatuses(STEPS.map((_, i) => {
        if (isComplete) return 'completed';
        if (i < stepIndex) return 'completed';
        if (i === stepIndex) return 'active';
        return 'pending';
      }));
    });

    return unsubscribe;
  }, [workPromise, error]);

  // Fallback: when no progress API (e.g. browser), animate to 95% until resolve
  useEffect(() => {
    if (!workPromise || error) return;
    const api = window.electronAPI?.ai;
    if (typeof api?.onGenerateSelectsProgress === 'function') return;

    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const raw = Math.min(95, (elapsed / 3000) * 95);
      setProgress(Math.round(raw));
      const completedCount = Math.min(STEPS.length - 1, Math.floor(elapsed / FALLBACK_STEP_MS));
      setStepStatuses(STEPS.map((_, i) => {
        if (i < completedCount) return 'completed';
        if (i === completedCount) return 'active';
        return 'pending';
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [workPromise, error]);

  // Handle promise resolve/reject
  useEffect(() => {
    if (!workPromise) return;
    workPromise
      .then((result) => {
        if (result?.success) {
          setProgress(100);
          setStepStatuses(STEPS.map(() => 'completed'));
          onComplete?.();
        } else {
          setError(result?.error || 'Generation failed');
          onError?.(result?.error);
        }
      })
      .catch((err) => {
        const msg = err?.message || String(err);
        setError(msg);
        onError?.(msg);
      });
  }, [workPromise, onComplete, onError]);

  if (error) {
    return (
      <div className="generate-selects-loading" role="region" aria-label="Generate selects error">
        <p className="generate-selects-loading-error" role="alert">
          {error}
        </p>
        {onBack && (
          <button
            type="button"
            className="generate-selects-loading-back"
            onClick={onBack}
          >
            Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="generate-selects-loading" role="region" aria-label="Generating selects">
      <div className="generate-selects-loading-bar-wrap">
        <div
          className="generate-selects-loading-bar-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${progress} percent`}
        >
          <div
            className="generate-selects-loading-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <p className="generate-selects-loading-percent" aria-live="polite">
        {progress}%
      </p>
      <div className="generate-selects-loading-steps-wrap">
        <ul className="generate-selects-loading-steps" aria-label="Processing steps">
        {STEPS.map((step, i) => {
          const status = stepStatuses[i];
          return (
            <li
              key={step.id}
              className={`generate-selects-loading-step generate-selects-loading-step--${status}`}
            >
              <span className="generate-selects-loading-step-icon" aria-hidden="true">
                {status === 'pending' && (
                  <Icon type="loading-step-pending" size="md" state="disabled" />
                )}
                {status === 'active' && (
                  <Icon type="loading-step-active" size="md" state="secondary" className="generate-selects-loading-spinner" />
                )}
                {status === 'completed' && (
                  <Icon type="loading-step-completed" size="md" className="icon--success" />
                )}
              </span>
              <span className="generate-selects-loading-step-label">{step.label}</span>
            </li>
          );
        })}
        </ul>
      </div>
    </div>
  );
}

export default GenerateSelectsLoading;
