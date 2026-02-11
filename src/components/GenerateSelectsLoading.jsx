import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import './styles/GenerateSelectsLoading.css';

const STEPS = [
  { id: 'analyzing', label: 'Analyzing video content' },
  { id: 'transcript', label: 'Generating transcript' },
  { id: 'key-moments', label: 'Detecting key moments' },
  { id: 'highlights', label: 'Identifying highlights' },
  { id: 'trimming', label: 'Trimming segments' },
  { id: 'finalizing', label: 'Finalizing selections' },
];

const STEP_DURATION_MS = 1200;
const TOTAL_DURATION_MS = STEPS.length * STEP_DURATION_MS;

function GenerateSelectsLoading({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [stepStatuses, setStepStatuses] = useState(STEPS.map(() => 'pending'));
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    startTimeRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed >= TOTAL_DURATION_MS) {
        setProgress(100);
        setStepStatuses(STEPS.map(() => 'completed'));
        onComplete?.();
        return;
      }
      const rawProgress = (elapsed / TOTAL_DURATION_MS) * 100;
      setProgress(Math.min(Math.round(rawProgress), 100));

      const completedCount = Math.floor(elapsed / STEP_DURATION_MS);
      const next = STEPS.map((_, i) => {
        if (i < completedCount) return 'completed';
        if (i === completedCount) return 'active';
        return 'pending';
      });
      setStepStatuses(next);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onComplete]);

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
