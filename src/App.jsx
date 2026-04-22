import React, { useState, useEffect } from 'react';
import NavigationBar from './components/NavigationBar';
import ProjectManagement from './screens/ProjectManagement';
import ImportMedia from './screens/ImportMedia';
import Timeline from './screens/Timeline';
import Button from './components/Button';
import './styles/App.css';

/** Mock project for browser-only viewing of the media upload page (e.g. localhost:5173/#/import) */
const MOCK_PROJECT_FOR_BROWSER = { id: 'browser-mock', name: 'Demo Project', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

/**
 * Error Boundary: catches render errors in screen content and shows a fallback
 * instead of a blank screen. "Go back" resets the boundary and calls onReset so
 * the user can navigate to a safe screen.
 */
class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
      return (
        <div className="app-error-fallback">
          <p className="app-error-fallback__message">Something went wrong on this screen.</p>
          <pre className="app-error-fallback__detail" aria-live="polite">
            {this.state.error.message}
          </pre>
          {isDev && this.state.errorInfo?.componentStack && (
            <pre className="app-error-fallback__stack">{this.state.errorInfo.componentStack}</pre>
          )}
          <Button variant="primary" onClick={this.handleReset} className="app-error-fallback__button">
            Go back
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [importScreen, setImportScreen] = useState('import'); // 'import' | 'timeline'

  // In browser: open page from hash (e.g. #/import, #/timeline)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash === '#/import' || hash === '#import') {
      setCurrentProject(MOCK_PROJECT_FOR_BROWSER);
      setImportScreen('import');
    } else if (hash === '#/timeline' || hash === '#timeline') {
      setCurrentProject(MOCK_PROJECT_FOR_BROWSER);
      setImportScreen('timeline');
    }
  }, []);

  const handleOpenProject = (project, destination = 'import') => {
    setCurrentProject(project);
    setImportScreen(destination === 'timeline' ? 'timeline' : 'import');
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

  const handleErrorBoundaryReset = () => {
    setImportScreen('import');
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
        <ScreenErrorBoundary onReset={handleErrorBoundaryReset}>
          {!currentProject ? (
            <ProjectManagement onOpenProject={handleOpenProject} />
          ) : importScreen === 'timeline' ? (
            <Timeline
              project={currentProject}
              onBack={handleBackToImport}
            />
          ) : (
            <ImportMedia
              project={currentProject}
              onBack={handleBackToProjects}
              onNavigateToTimeline={handleNavigateToTimeline}
            />
          )}
        </ScreenErrorBoundary>
      </main>
    </div>
  );
}

export default App;
