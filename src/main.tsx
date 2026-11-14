import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/typography.css';
import './styles/animations.css';
import './styles/global.css';
import App from './app/App';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'Inter, system-ui, sans-serif',
            backgroundColor: '#f5f5f2',
            color: '#111111',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            Word encountered an unexpected issue
          </h1>
          <p style={{ fontSize: '14px', color: '#555', maxWidth: '460px', marginBottom: '16px' }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 18px',
              borderRadius: '999px',
              border: '1px solid #111',
              backgroundColor: '#111',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13.5px',
              fontWeight: 500,
            }}
          >
            Reload application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
