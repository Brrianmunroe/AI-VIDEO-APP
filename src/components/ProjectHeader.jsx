import React from 'react';
import Icon from './Icon';
import Button from './Button';
import './styles/ProjectHeader.css';

function ProjectHeader({
  projectName,
  onBack,
  breadcrumbCurrent = 'Interview Footage',
  onRecut,
  recutDisabled = false,
  recutLabel = 'Re-cut',
}) {
  return (
    <header className="project-header">
      <button className="back-button" onClick={onBack} aria-label="Go back">
        <Icon type="back" size="md" state="primary" />
      </button>
      <div className="breadcrumb">
        <span className="breadcrumb-item breadcrumb-project">{projectName}</span>
        <span className="breadcrumb-item breadcrumb-separator">/</span>
        <span className="breadcrumb-item breadcrumb-current">{breadcrumbCurrent}</span>
      </div>
      {onRecut && (
        <div className="project-header__actions">
          <Button
            variant="secondary"
            onClick={onRecut}
            disabled={recutDisabled}
            className="project-header__recut-button"
          >
            {recutLabel}
          </Button>
        </div>
      )}
    </header>
  );
}

export default ProjectHeader;
