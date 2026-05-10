import React, { useState } from 'react';
import { useAuthService } from '../services/auth.context';

interface UserProfile {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  officeLocation?: string;
  mobilePhone?: string;
}

export function HomePage() {
  const { userName, logout, getAccessToken, authProvider } = useAuthService();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        console.error('No access token available');
        return;
      }
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setProfile(data);
    } catch (err) {
      console.error('Graph API error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>🏠 Dashboard</h1>
        <p>
          You are successfully authenticated via{' '}
          <strong>{authProvider.toUpperCase()}</strong>!
        </p>
        <p style={styles.welcome}>Welcome, {userName}!</p>

        <div style={styles.buttons}>
          <button style={styles.primaryBtn} onClick={loadProfile} disabled={loading}>
            {loading ? 'Loading...' : 'Load My Profile (Graph API)'}
          </button>
          <button style={styles.dangerBtn} onClick={logout}>
            Sign Out
          </button>
        </div>

        {profile && (
          <div style={styles.profileData}>
            <h3>Microsoft Graph Response:</h3>
            <table style={styles.table}>
              <tbody>
                <tr>
                  <td style={styles.tdLabel}>Name</td>
                  <td>{profile.displayName}</td>
                </tr>
                <tr>
                  <td style={styles.tdLabel}>Email</td>
                  <td>{profile.mail || profile.userPrincipalName}</td>
                </tr>
                <tr>
                  <td style={styles.tdLabel}>Job Title</td>
                  <td>{profile.jobTitle || 'N/A'}</td>
                </tr>
                <tr>
                  <td style={styles.tdLabel}>Office</td>
                  <td>{profile.officeLocation || 'N/A'}</td>
                </tr>
                <tr>
                  <td style={styles.tdLabel}>Phone</td>
                  <td>{profile.mobilePhone || 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
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
    background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '48px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    textAlign: 'center' as const,
    maxWidth: 520,
    width: '100%',
  },
  welcome: {
    fontSize: 18,
    color: '#555',
  },
  buttons: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    margin: '24px 0',
    flexWrap: 'wrap' as const,
  },
  primaryBtn: {
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 600,
    color: 'white',
    background: '#0078d4',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 600,
    color: 'white',
    background: '#dc3545',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  profileData: {
    textAlign: 'left' as const,
    marginTop: 24,
    padding: 16,
    background: '#f8f9fa',
    borderRadius: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  tdLabel: {
    fontWeight: 700,
    padding: '8px 12px',
    borderBottom: '1px solid #dee2e6',
    width: '35%',
  },
};
