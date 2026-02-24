import React, { useState, useEffect, useRef } from 'react';
import ProjectHeader from '../components/ProjectHeader';
import MediaGrid from '../components/MediaGrid';
import GenerateSelectsButton from '../components/GenerateSelectsButton';
import GenerateSelectsModal from '../components/GenerateSelectsModal';
import GenerateSelectsLoading from '../components/GenerateSelectsLoading';
import './styles/ImportMedia.css';

function ImportMedia({ project, onBack, onNavigateToTimeline }) {
  const [mediaFiles, setMediaFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isGenerateSelectsModalOpen, setIsGenerateSelectsModalOpen] = useState(false);
  const [showGenerateSelectsLoading, setShowGenerateSelectsLoading] = useState(false);
  const [generateSelectsPromise, setGenerateSelectsPromise] = useState(null);
  const hasRefreshedDurations = useRef(false);
  const fileInputRef = useRef(null);
  const isBrowser = typeof window !== 'undefined' && window.electronAPI?._browserShim === true;

  useEffect(() => {
    if (project && window.electronAPI) {
      hasRefreshedDurations.current = false;
      loadMediaFiles();
    } else {
      setLoading(false);
    }
  }, [project]);

  const handleBrowserFileSelect = async (e) => {
    const files = e.target.files;
    if (!files?.length || !project || !window.electronAPI?._browserShim) return;
    try {
      const addResult = await window.electronAPI.media.addFiles(project.id, Array.from(files));
      if (addResult.success) {
        await loadMediaFiles();
      }
    } catch (err) {
      console.error('Failed to add files:', err);
      alert(`Failed to add files: ${err.message}`);
    }
    e.target.value = '';
  };

  const loadMediaFiles = async () => {
    if (!window.electronAPI || !project) return;

    try {
      const result = await window.electronAPI.media.getByProject(project.id);
      if (result.success) {
        const data = result.data || [];
        setMediaFiles(data);

        if (
          data.length > 0 &&
          window.electronAPI.media.refreshDurations &&
          !hasRefreshedDurations.current
        ) {
          hasRefreshedDurations.current = true;
          await window.electronAPI.media.refreshDurations(project.id);
          await loadMediaFiles();
        }
      }
    } catch (error) {
      console.error('Failed to load media files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFootage = async () => {
    if (!window.electronAPI || !project) return;

    if (isBrowser) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const result = await window.electronAPI.media.selectFiles();
      if (result.success && result.files && result.files.length > 0) {
        const addResult = await window.electronAPI.media.addFiles(project.id, result.files);
        if (addResult.success) {
          await loadMediaFiles();
        } else {
          console.error('Failed to add files:', addResult.error);
          alert(`Failed to add files: ${addResult.error}`);
        }
      }
    } catch (error) {
      console.error('Failed to add footage:', error);
      alert(`Failed to add footage: ${error.message}`);
    }
  };

  const handleClipNameChange = async (mediaId, newName) => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.media.updateClipName(mediaId, newName);
      setMediaFiles((prev) =>
        prev.map((m) => (m.id === mediaId ? { ...m, clipName: newName } : m))
      );
    } catch (error) {
      console.error('Failed to update clip name:', error);
    }
  };

  const handleDeleteFootage = async (mediaId) => {
    if (!window.electronAPI || !project) return;
    if (!window.confirm('Remove this clip from the project? The file will not be deleted from disk.')) {
      return;
    }
    try {
      const result = await window.electronAPI.media.delete(mediaId);
      if (result.success) {
        await loadMediaFiles();
      } else {
        alert(`Failed to remove clip: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to delete footage:', error);
      alert(`Failed to remove clip: ${error.message}`);
    }
  };

  const handleGenerateSelects = () => {
    setIsGenerateSelectsModalOpen(true);
  };

  const handleGenerateSelectsSubmit = (context) => {
    if (!project || !window.electronAPI?.ai?.generateSelects) {
      console.error('AI generateSelects not available');
      return;
    }
    setIsGenerateSelectsModalOpen(false);
    const promise = window.electronAPI.ai.generateSelects({
      projectId: project.id,
      storyContext: context.storyContext ?? '',
      desiredDurationSec: context.desiredDurationSec ?? 120,
    });
    setGenerateSelectsPromise(promise);
    setShowGenerateSelectsLoading(true);
  };

  const handleLoadingComplete = () => {
    onNavigateToTimeline?.();
  };

  const handleBackFromLoading = () => {
    setShowGenerateSelectsLoading(false);
    setGenerateSelectsPromise(null);
  };

  const handleSkipGenerateSelects = (context = {}) => {
    if (!project || !window.electronAPI?.ai?.generateSelects) {
      console.error('AI generateSelects not available');
      return;
    }
    setIsGenerateSelectsModalOpen(false);
    const promise = window.electronAPI.ai.generateSelects({
      projectId: project.id,
      storyContext: '',
      desiredDurationSec: context.desiredDurationSec ?? 120,
    });
    setGenerateSelectsPromise(promise);
    setShowGenerateSelectsLoading(true);
  };

  if (loading) {
    return (
      <div className="import-media-loading">
        <div>Loading media files...</div>
      </div>
    );
  }

  if (showGenerateSelectsLoading) {
    return (
      <div className="import-media">
        <ProjectHeader
          projectName={project?.name || 'Project'}
          onBack={handleBackFromLoading}
          breadcrumbCurrent="Interview Selects"
        />
        <div className="import-media-content import-media-content--loading">
          <GenerateSelectsLoading
            workPromise={generateSelectsPromise}
            onComplete={handleLoadingComplete}
            onBack={handleBackFromLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="import-media">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.m4v,.mp3,.wav,.aac,.m4a,.flac"
        style={{ display: 'none' }}
        onChange={handleBrowserFileSelect}
        aria-label="Select media files"
      />
      <ProjectHeader
        projectName={project?.name || 'Project'}
        onBack={onBack}
      />
      <div className="import-media-content">
        <div className="import-media-header">
          <div className="import-media-info">
            <h2 className="files-count">
              {mediaFiles.length} File{mediaFiles.length !== 1 ? 's' : ''} uploaded
            </h2>
          </div>
          <GenerateSelectsButton
            onClick={handleGenerateSelects}
            disabled={mediaFiles.length === 0}
          />
        </div>

        <MediaGrid
          mediaFiles={mediaFiles}
          onAddFootage={handleAddFootage}
          onClipNameChange={handleClipNameChange}
          onDeleteFootage={handleDeleteFootage}
        />
      </div>

      <GenerateSelectsModal
        isOpen={isGenerateSelectsModalOpen}
        onClose={() => setIsGenerateSelectsModalOpen(false)}
        onCreate={handleGenerateSelectsSubmit}
        onSkip={handleSkipGenerateSelects}
      />
    </div>
  );
}

export default ImportMedia;
