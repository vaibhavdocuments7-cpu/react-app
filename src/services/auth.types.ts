// ============================================================================
// Abstract Auth Service — common interface for MSAL and OIDC in React
// ============================================================================
// Components use the useAuthService() hook — they don't know which provider is active.

export interface AuthContextValue {
  isAuthenticated: boolean;
  userName: string;
  userEmail: string;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string>;
  authProvider: string;
}
