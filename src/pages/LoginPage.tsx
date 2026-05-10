import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthService } from '../services/auth.context';

export function LoginPage() {
  const { isAuthenticated, login, authProvider } = useAuthService();
  const navigate = useNavigate();

  // Auto-redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <svg width="40" height="40" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          <h1 style={styles.title}>React App</h1>
        </div>

        <div style={styles.welcome}>
          <h2>Welcome</h2>
          <p>Sign in with your Microsoft account to continue</p>
          <p style={styles.providerBadge}>
            Auth Provider: <strong>{authProvider.toUpperCase()}</strong>
          </p>
          <button style={styles.loginBtn} onClick={login}>
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none" style={{ marginRight: 8 }}>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '48px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    textAlign: 'center' as const,
    maxWidth: 420,
    width: '100%',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    margin: 0,
    color: '#333',
  },
  welcome: {
    marginTop: 16,
  },
  providerBadge: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    marginBottom: 24,
  },
  loginBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 600,
    color: 'white',
    background: '#0078d4',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};
