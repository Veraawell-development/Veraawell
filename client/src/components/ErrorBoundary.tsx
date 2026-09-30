import React from 'react';

/**
 * The app had no error boundary at all, so any throw during render unmounted
 * the entire tree and left a blank white page.
 *
 * Two real crashes shipped behind that blankness — an out-of-range question
 * index on the mental-health tests, and a session whose doctor account had
 * been deleted — and neither was diagnosable from a screenshot, because a
 * white page looks identical whatever threw. Both were one unguarded property
 * access.
 *
 * This does not prevent crashes. It makes them legible: the user is told
 * something went wrong and offered a way out, and the error reaches the
 * console with a component stack instead of vanishing.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept as console.error rather than the app logger: this runs when the
    // tree is already broken, and the logger imports config that may itself
    // be implicated.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  handleHome = () => {
    this.setState({ error: null });
    window.location.href = '/';
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f6f3ec',
          fontFamily: "'Public Sans', Inter, system-ui, sans-serif"
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#fff',
              border: '1px solid rgba(27,43,46,.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: 22
            }}
            aria-hidden="true"
          >
            ⚠️
          </div>

          <h1
            style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: 26,
              color: '#16262a',
              margin: '0 0 10px'
            }}
          >
            Something went wrong
          </h1>

          <p style={{ fontSize: 14.5, lineHeight: 1.5, color: '#6b7573', margin: '0 0 24px' }}>
            This page ran into an unexpected problem. Nothing you entered has been lost —
            reloading usually clears it.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={this.handleReload}
              style={{
                background: '#1f7a8c',
                color: '#fff',
                border: 'none',
                borderRadius: 100,
                padding: '10px 22px',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reload the page
            </button>
            <button
              onClick={this.handleHome}
              style={{
                background: 'transparent',
                color: '#1f7a8c',
                border: '1px solid rgba(31,122,140,.3)',
                borderRadius: 100,
                padding: '10px 22px',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Go home
            </button>
          </div>

          {isDev && (
            <pre
              style={{
                marginTop: 28,
                padding: 14,
                background: '#fff',
                border: '1px solid rgba(27,43,46,.08)',
                borderRadius: 10,
                fontSize: 11.5,
                lineHeight: 1.45,
                color: '#8a938f',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                overflowX: 'auto'
              }}
            >
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
