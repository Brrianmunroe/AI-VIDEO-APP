import React, { useState, useRef, useEffect } from 'react';
import Button from './Button';
import Icon from './Icon';
import './styles/GenerateSelectsModal.css';

function GenerateSelectsModal({ isOpen, onClose, onCreate, onSkip }) {
  const [storyContext, setStoryContext] = useState('');
  const [styleContext, setStyleContext] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingLink, setIsProcessingLink] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStoryContext('');
      setStyleContext('');
      setVideoLink('');
      setUploadedFiles([]);
      setIsDragging(false);
      setIsProcessingLink(false);
    }
  }, [isOpen]);

  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const newFiles = fileArray.map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      type: 'file',
      file: file,
      progress: 0,
      thumbnail: null,
    }));

    // Simulate upload progress
    newFiles.forEach((fileObj) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? { ...f, progress: Math.min(progress, 100) }
              : f
          )
        );
        if (progress >= 100) {
          clearInterval(interval);
        }
      }, 200);
    });

    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileInputChange = (e) => {
    handleFileSelect(e.target.files);
    e.target.value = ''; // Reset input
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleVideoLinkPaste = async (e) => {
    const pastedLink = e.clipboardData.getData('text').trim();
    if (pastedLink && isValidVideoLink(pastedLink)) {
      e.preventDefault();
      await processVideoLink(pastedLink);
    }
  };

  const handleVideoLinkBlur = async () => {
    const trimmedLink = videoLink.trim();
    if (trimmedLink && isValidVideoLink(trimmedLink)) {
      await processVideoLink(trimmedLink);
    }
  };

  const handleVideoLinkKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmedLink = videoLink.trim();
      if (trimmedLink && isValidVideoLink(trimmedLink)) {
        await processVideoLink(trimmedLink);
      }
    }
  };

  const isValidVideoLink = (link) => {
    // Check for common video platform URLs
    const videoUrlPatterns = [
      /youtube\.com\/watch\?v=/,
      /youtu\.be\//,
      /vimeo\.com\/\d+/,
      /youtube\.com\/embed\//,
      /\.mp4$/i,
      /\.mov$/i,
      /\.webm$/i,
      /\.mkv$/i,
    ];
    return videoUrlPatterns.some((pattern) => pattern.test(link));
  };

  const processVideoLink = async (link) => {
    if (isProcessingLink) return;

    setIsProcessingLink(true);
    
    // Check if link already exists
    const existingFile = uploadedFiles.find((f) => f.link === link);
    if (existingFile) {
      setIsProcessingLink(false);
      return;
    }

    // Extract video name from URL or use default
    const videoName = extractVideoName(link);

    // Add to uploaded files with processing state
    const newFile = {
      id: `link-${Date.now()}`,
      name: videoName,
      type: 'link',
      link: link,
      progress: 0,
      thumbnail: null,
    };

    setUploadedFiles((prev) => [...prev, newFile]);
    setVideoLink(''); // Clear input after processing

    // Simulate processing/loading progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === newFile.id
            ? { ...f, progress: Math.min(progress, 100) }
            : f
        )
      );
      if (progress >= 100) {
        clearInterval(interval);
        setIsProcessingLink(false);
      }
    }, 300);
  };

  const extractVideoName = (link) => {
    // Try to extract video ID or filename from URL
    try {
      const url = new URL(link);
      if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
        const videoId = url.searchParams.get('v') || link.split('/').pop()?.split('?')[0];
        return `YouTube Video (${videoId || 'link'})`;
      }
      if (url.hostname.includes('vimeo.com')) {
        const videoId = link.split('/').pop()?.split('?')[0];
        return `Vimeo Video (${videoId || 'link'})`;
      }
      // For direct video file links, use filename
      const pathParts = url.pathname.split('/');
      const filename = pathParts[pathParts.length - 1];
      return filename || 'Video Link';
    } catch {
      // If URL parsing fails, use a default name
      return 'Video Link';
    }
  };

  const handleRemoveFile = (fileId) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleCreate = () => {
    onCreate({
      storyContext: storyContext.trim(),
      styleContext: styleContext.trim(),
      exampleFiles: uploadedFiles
        .filter((f) => f.type === 'file')
        .map((f) => ({
          name: f.name,
          file: f.file,
        })),
      exampleLinks: uploadedFiles
        .filter((f) => f.type === 'link')
        .map((f) => f.link),
    });
    
    // Form will be reset by useEffect when modal closes
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
            For better results provide a brief of what you are looking for. Include story, the pace, the style, and examples.
          </p>
        </div>

        <div className="modal-body modal-body--scrollable">
          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Story Context</label>
            <textarea
              className="form-field__textarea"
              placeholder="Project"
              value={storyContext}
              onChange={(e) => setStoryContext(e.target.value)}
              rows={4}
            />
          </div>

          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Style Context</label>
            <textarea
              className="form-field__textarea"
              placeholder="Project"
              value={styleContext}
              onChange={(e) => setStyleContext(e.target.value)}
              rows={4}
            />
          </div>

          <div className="form-field" onClick={(e) => e.stopPropagation()}>
            <label className="form-field__label">Examples</label>
            
            {/* Uploaded files list */}
            {uploadedFiles.length > 0 && (
              <div className="uploaded-files-list">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="uploaded-file-item">
                    <div className="uploaded-file-thumbnail">
                      {file.thumbnail ? (
                        <img src={file.thumbnail} alt={file.name} />
                      ) : (
                        <div className="uploaded-file-placeholder" />
                      )}
                    </div>
                    <div className="uploaded-file-info">
                      <div className="uploaded-file-name">{file.name}</div>
                      {file.progress < 100 && (
                        <div className="uploaded-file-progress">
                          <div
                            className="uploaded-file-progress-bar"
                            style={{ width: `${file.progress}%` }}
                          />
                          <span className="uploaded-file-progress-text">{file.progress}%</span>
                        </div>
                      )}
                    </div>
                    <button
                      className="uploaded-file-remove"
                      onClick={() => handleRemoveFile(file.id)}
                      aria-label="Remove file"
                    >
                      <Icon type="close" size="sm" state="primary" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Drag and drop zone */}
            <div
              ref={dropZoneRef}
              className={`file-drop-zone ${isDragging ? 'file-drop-zone--dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="file-drop-zone-icon">
                <Icon type="upload" size="lg" state="primary" />
              </div>
              <div className="file-drop-zone-text">Drag and Drop Video Files</div>
              <div className="file-drop-zone-link">
                or <button type="button" className="file-drop-zone-link-button">Choose Files</button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
            </div>

            {/* Video link input */}
            <div className="form-field-video-link">
              <input
                type="text"
                className="form-field__input"
                placeholder="Paste Video Link"
                value={videoLink}
                onChange={(e) => setVideoLink(e.target.value)}
                onPaste={handleVideoLinkPaste}
                onBlur={handleVideoLinkBlur}
                onKeyDown={handleVideoLinkKeyDown}
                disabled={isProcessingLink}
              />
            </div>
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
