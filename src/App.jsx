import React, { useState, useEffect } from 'react';
import NavigationBar from './components/NavigationBar';
import ProjectManagement from './screens/ProjectManagement';
import ImportMedia from './screens/ImportMedia';
import Timeline from './screens/Timeline';
import TimelineReview from './screens/TimelineReview';
import './styles/App.css';

/** Mock project for browser-only viewing of the media upload page (e.g. localhost:5173/#/import) */
const MOCK_PROJECT_FOR_BROWSER = { id: 'browser-mock', name: 'Demo Project', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [importScreen, setImportScreen] = useState('import'); // 'import' | 'timeline' | 'timeline-review'
  const [acceptedTimelineClips, setAcceptedTimelineClips] = useState([]);

  // In browser: open media upload page when hash is #/import (no Electron needed)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#/import' || window.location.hash === '#import') {
      setCurrentProject(MOCK_PROJECT_FOR_BROWSER);
    }
  }, []);

  const handleOpenProject = (project) => {
    setCurrentProject(project);
    setImportScreen('import');
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setImportScreen('import');
    if (typeof window !== 'undefined' && (window.location.hash === '#/import' || window.location.hash === '#import')) {
      window.location.hash = '';
    }
  };

  const handleNavigateToTimeline = () => {
    setImportScreen('timeline');
  };

  const handleBackToImport = () => {
    setImportScreen('import');
  };

  const handleNavigateToTimelineReview = (acceptedClips = []) => {
    setAcceptedTimelineClips(acceptedClips);
    setImportScreen('timeline-review');
  };

  const handleBackToTimeline = () => {
    setImportScreen('timeline');
  };

  return (
    <div className="app">
      <NavigationBar
        activeItem={currentProject ? 'projects' : 'home'}
        onNavigate={(item) => {
          if (item === 'home') handleBackToProjects();
        }}
      />
      <main className="app-main">
        {!currentProject ? (
          <ProjectManagement onOpenProject={handleOpenProject} />
        ) : importScreen === 'timeline-review' ? (
          <TimelineReview
            project={currentProject}
            onBack={handleBackToTimeline}
            acceptedClips={acceptedTimelineClips}
          />
        ) : importScreen === 'timeline' ? (
          <Timeline
            project={currentProject}
            onBack={handleBackToImport}
            onNavigateToTimelineReview={handleNavigateToTimelineReview}
          />
        ) : (
          <ImportMedia
            project={currentProject}
            onBack={handleBackToProjects}
            onNavigateToTimeline={handleNavigateToTimeline}
          />
        )}
      </main>
    </div>
  );
}

export default App;
