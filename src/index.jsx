import { installBrowserAPI } from './browserAPI';
installBrowserAPI();

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './styles/index.css';

class RootErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Root] Crash:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', padding: 24, background: '#021016', color: '#F9FDFF',
          fontFamily: 'system-ui, sans-serif', overflow: 'auto',
        }}>
          <h1 style={{ marginBottom: 16 }}>Something went wrong</h1>
          <pre style={{ padding: 16, background: '#02161E', borderRadius: 8, overflow: 'auto', fontSize: 14 }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          {this.state.error?.stack && (
            <pre style={{ marginTop: 16, padding: 16, background: '#02161E', borderRadius: 8, overflow: 'auto', fontSize: 12, opacity: 0.8 }}>
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<div style="padding:24px;color:red;">Error: #root not found</div>';
} else {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <RootErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </RootErrorBoundary>
    </React.StrictMode>
  );
}
