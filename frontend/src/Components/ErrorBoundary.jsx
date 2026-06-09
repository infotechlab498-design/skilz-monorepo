import React from 'react';

/**
 * ErrorBoundary — catches any unhandled render errors in child components.
 * Renders a styled recovery UI instead of a blank screen.
 */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleReturn = () => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.href = '/ludoLobby';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.overlay}>
          <div style={styles.card}>
            <div style={styles.iconWrapper}>⚠️</div>
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.message}>
              An unexpected error occurred. Your game progress may be saved.
            </p>
            {this.state.errorMessage && (
              <code style={styles.errorCode}>{this.state.errorMessage}</code>
            )}
            <button
              style={styles.button}
              onClick={this.handleReturn}
              onMouseEnter={e => (e.target.style.background = '#6d28d9')}
              onMouseLeave={e => (e.target.style.background = '#7c3aed')}
            >
              Return to Lobby
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  overlay: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    padding: '24px',
  },
  card: {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '20px',
    padding: '48px 40px',
    maxWidth: '460px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
  },
  iconWrapper: {
    fontSize: '48px',
    marginBottom: '20px',
  },
  title: {
    color: '#f1f5f9',
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '12px',
  },
  message: {
    color: '#94a3b8',
    fontSize: '15px',
    lineHeight: 1.6,
    marginBottom: '16px',
  },
  errorCode: {
    display: 'block',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    marginBottom: '24px',
    wordBreak: 'break-word',
    textAlign: 'left',
  },
  button: {
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 28px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    width: '100%',
  },
};

export default ErrorBoundary;
