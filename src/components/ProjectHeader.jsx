import React from 'react';
import Icon from './Icon';
import './styles/ProjectHeader.css';

function ProjectHeader({
  projectName,
  onBack,
  breadcrumbCurrent = 'Interview Footage',
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
    </header>
  );
}

export default ProjectHeader;
