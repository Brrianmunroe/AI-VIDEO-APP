import React, { useState, useEffect, useRef } from 'react';
import Button from './Button';
import TextInput from './TextInput';
import DropDown from './DropDown';
import Icon from './Icon';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './styles/CreateProjectModal.css';

function CreateProjectModal({ isOpen, onClose, onCreate }) {
  const [projectName, setProjectName] = useState('');
  const [location, setLocation] = useState('');
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const containerRef = useRef(null);
  useFocusTrap(containerRef, isOpen);

  useEffect(() => {
    // Set default location when modal opens
    if (isOpen && !location) {
      setLocation('Default');
    }
    
    // Debug: Check if electronAPI is available
    if (isOpen) {
      console.log('[CreateProjectModal] window.electronAPI available:', !!window.electronAPI);
    }
  }, [isOpen]);

  const handleSelectFolder = async (event) => {
    // Prevent event bubbling to modal backdrop
    event.stopPropagation();
    event.preventDefault();

    console.log('[CreateProjectModal] handleSelectFolder called');
    console.log('[CreateProjectModal] window.electronAPI available:', !!window.electronAPI);

    if (!window.electronAPI) {
      alert('Electron API not available. Please restart the app.');
      return;
    }

    setIsSelectingFolder(true);
    try {
      console.log('[CreateProjectModal] Calling electronAPI.projects.selectFolder()');
      const result = await window.electronAPI.projects.selectFolder();
      console.log('[CreateProjectModal] selectFolder result:', result);

      if (result.success && !result.canceled) {
        console.log('[CreateProjectModal] Setting location to:', result.path);
        setLocation(result.path);
      } else if (result.canceled) {
        console.log('[CreateProjectModal] User canceled folder selection');
        // User canceled - no action needed
      } else {
        alert(`Failed to select folder: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
      alert(`Failed to select folder: ${error.message}`);
    } finally {
      setIsSelectingFolder(false);
    }
  };

  const handleCreate = () => {
    if (!projectName.trim()) {
      return;
    }
    
    const projectLocation = location === 'Default' ? null : location;
    onCreate(projectName.trim(), projectLocation);
    setProjectName('');
    setLocation('Default');
  };

  const handleCancel = () => {
    setProjectName('');
    setLocation('Default');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={handleCancel} />
      <div
        ref={containerRef}
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="create-project-modal-title" className="modal-title">New Project</h2>
          <button className="modal-close" onClick={handleCancel} aria-label="Close">
            <Icon type="close" size="sm" state="primary" />
          </button>
        </div>

        <div className="modal-body">
          <TextInput
            label="Project Name"
            placeholder="Project"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            autoFocus
          />

          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Location</label>
            <button
              className={`location-trigger ${isSelectingFolder ? 'location-trigger--disabled' : ''}`}
              onClick={handleSelectFolder}
              disabled={isSelectingFolder}
              type="button"
              aria-label="Select folder location"
            >
              <span className={`location-trigger__value ${location === 'Default' ? 'location-trigger__value--placeholder' : ''}`}>
                {location || 'Default'}
              </span>
              <Icon
                type="chevron-down"
                size="sm"
                state={isSelectingFolder ? 'disabled' : 'secondary'}
              />
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={!projectName.trim()}
          >
            Create
          </Button>
        </div>
      </div>
    </>
  );
}

export default CreateProjectModal;
