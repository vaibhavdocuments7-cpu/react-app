import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthContext } from './auth.context';
import type { AuthContextValue } from './auth.types';
import { environment } from '../config/environment';

const azureAd = environment.azureAd;
const TENANT_ID = azureAd.tenantId;
const CLIENT_ID = azureAd.clientId;
const REDIRECT_URI = azureAd.redirectUri;
const SCOPES = 'openid profile email user.read offline_access';

// Azure AD endpoints
const AUTHORIZE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const LOGOUT_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/logout`;

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'manual_auth_access_token',
  ID_TOKEN: 'manual_auth_id_token',
  REFRESH_TOKEN: 'manual_auth_refresh_token',
  EXPIRES_AT: 'manual_auth_expires_at',
  CODE_VERIFIER: 'manual_auth_code_verifier',
  STATE: 'manual_auth_state',
};

// ============================================================================
// PKCE Helper Functions
// ============================================================================

// Step 1: Generate a random code_verifier (43-128 chars of unreserved URI chars)
function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// Step 2: Create code_challenge = Base64URL(SHA-256(code_verifier))
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

// Step 3: Generate random state parameter (prevents CSRF attacks)
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// Base64 URL encoding (no padding, URL-safe chars)
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ============================================================================
// JWT Decoder (decode ID token to get user info)
// ============================================================================
function decodeJwt(token: string): Record<string, any> {
  const payload = token.split('.')[1];
  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decoded);
}

// ============================================================================
// Manual OAuth Provider Component
// ============================================================================
export function ManualAuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string>(
    () => sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || ''
  );
  const [idToken, setIdToken] = useState<string>(
    () => sessionStorage.getItem(STORAGE_KEYS.ID_TOKEN) || ''
  );
  const [isLoading, setIsLoading] = useState(true);

  // Decode ID token to get user claims
  const userClaims = useMemo(() => {
    if (!idToken) return null;
    try {
      return decodeJwt(idToken);
    } catch {
      return null;
    }
  }, [idToken]);

  // ============================================================================
  // Step A: Exchange authorization code for tokens
  // ============================================================================
  const exchangeCodeForTokens = useCallback(async (code: string) => {
    const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
    if (!codeVerifier) {
      console.error('Manual Auth: No code_verifier found in storage');
      return;
    }

    console.log('Manual Auth: Exchanging code for tokens...');

    // POST to /token endpoint — this is where the magic happens
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,  // PKCE: proves we started this flow
      scope: SCOPES,
    });

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Manual Auth: Token exchange failed:', error);
        return;
      }

      const tokens = await response.json();
      console.log('Manual Auth: Tokens received!', {
        hasAccessToken: !!tokens.access_token,
        hasIdToken: !!tokens.id_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });

      // Store tokens
      const expiresAt = Date.now() + tokens.expires_in * 1000;
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
      sessionStorage.setItem(STORAGE_KEYS.ID_TOKEN, tokens.id_token);
      sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt.toString());
      if (tokens.refresh_token) {
        sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
      }

      // Clean up PKCE values
      sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
      sessionStorage.removeItem(STORAGE_KEYS.STATE);

      // Update state
      setAccessToken(tokens.access_token);
      setIdToken(tokens.id_token);

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Manual Auth: Token exchange error:', err);
    }
  }, []);

  // ============================================================================
  // On mount: Check for ?code= in URL (redirect callback)
  // ============================================================================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const savedState = sessionStorage.getItem(STORAGE_KEYS.STATE);

    if (code) {
      // Validate state to prevent CSRF
      if (state !== savedState) {
        console.error('Manual Auth: State mismatch! Possible CSRF attack.');
        window.history.replaceState({}, document.title, window.location.pathname);
        setIsLoading(false);
        return;
      }

      exchangeCodeForTokens(code).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [exchangeCodeForTokens]);

  // ============================================================================
  // Login: Build authorize URL and redirect
  // ============================================================================
  const login = useCallback(async () => {
    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store for later verification
    sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
    sessionStorage.setItem(STORAGE_KEYS.STATE, state);

    // Build the authorization URL
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
      response_mode: 'query',
    });

    const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`;
    console.log('Manual Auth: Redirecting to Azure AD...');

    // Redirect to Microsoft login
    window.location.href = authorizeUrl;
  }, []);

  // ============================================================================
  // Logout: Clear tokens and redirect to Azure AD logout
  // ============================================================================
  const logout = useCallback(() => {
    // Clear all stored tokens
    Object.values(STORAGE_KEYS).forEach((key) => sessionStorage.removeItem(key));
    setAccessToken('');
    setIdToken('');

    // Redirect to Azure AD logout endpoint
    const params = new URLSearchParams({
      post_logout_redirect_uri: azureAd.postLogoutRedirectUri,
    });
    window.location.href = `${LOGOUT_URL}?${params.toString()}`;
  }, []);

  // ============================================================================
  // Get Access Token (with auto-refresh if expired)
  // ============================================================================
  const getAccessToken = useCallback(async (): Promise<string> => {
    const expiresAt = parseInt(sessionStorage.getItem(STORAGE_KEYS.EXPIRES_AT) || '0');

    // If token is still valid, return it
    if (accessToken && Date.now() < expiresAt) {
      return accessToken;
    }

    // Try to refresh using refresh_token
    const refreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (refreshToken) {
      console.log('Manual Auth: Token expired, refreshing...');
      const body = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: SCOPES,
      });

      try {
        const response = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (response.ok) {
          const tokens = await response.json();
          const newExpiresAt = Date.now() + tokens.expires_in * 1000;
          sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
          sessionStorage.setItem(STORAGE_KEYS.ID_TOKEN, tokens.id_token);
          sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, newExpiresAt.toString());
          if (tokens.refresh_token) {
            sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
          }
          setAccessToken(tokens.access_token);
          setIdToken(tokens.id_token);
          return tokens.access_token;
        }
      } catch (err) {
        console.error('Manual Auth: Token refresh failed:', err);
      }
    }

    return accessToken;
  }, [accessToken]);

  // ============================================================================
  // Auth Context Value
  // ============================================================================
  const authValue: AuthContextValue = useMemo(
    () => ({
      isAuthenticated: !!accessToken,
      userName: userClaims?.name || userClaims?.preferred_username || 'Unknown',
      userEmail: userClaims?.email || userClaims?.preferred_username || 'Unknown',
      authProvider: 'manual',
      login,
      logout,
      getAccessToken,
    }),
    [accessToken, userClaims, login, logout, getAccessToken]
  );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Exchanging authorization code for tokens...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
  );
}
