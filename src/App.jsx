import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import NavigationBar from './components/NavigationBar';
import ProjectManagement from './screens/ProjectManagement';
import ImportMedia from './screens/ImportMedia';
import Timeline from './screens/Timeline';
import TimelineReview from './screens/TimelineReview';
import Login from './screens/Login';
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
  const { isAuthenticated, loading, signOut } = useAuth();
  const [currentProject, setCurrentProject] = useState(null);
  const [importScreen, setImportScreen] = useState('import'); // 'import' | 'timeline' | 'timeline-review'
  const [acceptedTimelineClips, setAcceptedTimelineClips] = useState([]);
  const [appKey, setAppKey] = useState(0);

  const handleOuterErrorReset = () => setAppKey((k) => k + 1);

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

  const handleNavigateToTimeline = () => setImportScreen('timeline');
  const handleBackToImport = () => setImportScreen('import');

  const handleNavigateToTimelineReview = (acceptedClips = []) => {
    setAcceptedTimelineClips(acceptedClips);
    setImportScreen('timeline-review');
  };

  const handleBackToTimeline = () => setImportScreen('timeline');
  const handleErrorBoundaryReset = () => setImportScreen('import');

  if (loading) {
    return (
      <div className="app app--loading">
        <main className="app-main">
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // Authenticated: show main app (wrapped in error boundary to catch any crash)
  return (
    <ScreenErrorBoundary onReset={handleOuterErrorReset}>
      <AuthenticatedApp
        key={appKey}
        currentProject={currentProject}
        importScreen={importScreen}
        acceptedTimelineClips={acceptedTimelineClips}
        setCurrentProject={setCurrentProject}
        setImportScreen={setImportScreen}
        setAcceptedTimelineClips={setAcceptedTimelineClips}
        onOpenProject={handleOpenProject}
        onBackToProjects={handleBackToProjects}
        onNavigateToTimeline={handleNavigateToTimeline}
        onBackToImport={handleBackToImport}
        onNavigateToTimelineReview={handleNavigateToTimelineReview}
        onBackToTimeline={handleBackToTimeline}
        onErrorBoundaryReset={handleErrorBoundaryReset}
        signOut={signOut}
      />
    </ScreenErrorBoundary>
  );
}

function AuthenticatedApp({
  currentProject,
  importScreen,
  acceptedTimelineClips,
  setCurrentProject,
  setImportScreen,
  setAcceptedTimelineClips,
  onOpenProject,
  onBackToProjects,
  onNavigateToTimeline,
  onBackToImport,
  onNavigateToTimelineReview,
  onBackToTimeline,
  onErrorBoundaryReset,
  signOut,
}) {
  // Electron API required for desktop features (projects, media, etc.)
  if (typeof window !== 'undefined' && !window.electronAPI) {
    return (
      <div className="app">
        <main className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <p style={{ color: 'var(--color-text-placeholder)' }}>
            This app requires Electron. Run <code>npm run electron:dev</code> to launch the desktop app.
          </p>
        </main>
      </div>
    );
  }

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

  return (
    <div className="app">
      <NavigationBar
        activeItem={currentProject ? 'projects' : 'home'}
        onNavigate={(item) => {
          if (item === 'home') onBackToProjects();
        }}
        onSignOut={signOut}
      />
      <main className="app-main">
        <ScreenErrorBoundary onReset={onErrorBoundaryReset}>
          {!currentProject ? (
            <ProjectManagement onOpenProject={onOpenProject} />
          ) : importScreen === 'timeline-review' ? (
            <TimelineReview
              project={currentProject}
              onBack={onBackToTimeline}
              acceptedClips={acceptedTimelineClips}
            />
          ) : importScreen === 'timeline' ? (
            <Timeline
              project={currentProject}
              onBack={onBackToImport}
              onNavigateToTimelineReview={onNavigateToTimelineReview}
            />
          ) : (
            <ImportMedia
              project={currentProject}
              onBack={onBackToProjects}
              onNavigateToTimeline={onNavigateToTimeline}
            />
          )}
        </ScreenErrorBoundary>
      </main>
    </div>
  );
}

export default App;
