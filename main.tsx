import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App.tsx';
import { ActivationGate } from './ui/ActivationGate.tsx';

/** If anything crashes, show a message instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CHEMVERSE crashed:', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: '#edf5f7' }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: '#94a3b8' }}>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => { window.location.hash = '#/'; window.location.reload(); }}
            style={{ marginTop: 16, padding: '10px 18px', borderRadius: 12, border: '1px solid #293943', background: '#111b25', color: '#edf5f7' }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ActivationGate>
        <App />
      </ActivationGate>
    </ErrorBoundary>
  </StrictMode>,
);
