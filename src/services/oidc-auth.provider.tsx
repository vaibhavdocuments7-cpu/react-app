import React, { useMemo, useCallback } from 'react';
import { AuthProvider as OidcProvider, useAuth } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { AuthContext } from './auth.context';
import type { AuthContextValue } from './auth.types';
import { environment } from '../config/environment';

const azureAd = environment.azureAd;

// OIDC configuration for Azure AD
const oidcConfig = {
  authority: `https://login.microsoftonline.com/${azureAd.tenantId}/v2.0`,
  client_id: azureAd.clientId,
  redirect_uri: azureAd.redirectUri,
  post_logout_redirect_uri: azureAd.postLogoutRedirectUri,
  scope: 'openid profile email user.read offline_access',
  response_type: 'code',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  // Allow clock skew (same fix as Angular OIDC)
  clockSkewInSeconds: 600,
};

// Inner component that bridges react-oidc-context to our AuthContext
function OidcAuthInner({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  const authValue: AuthContextValue = useMemo(
    () => ({
      isAuthenticated: auth.isAuthenticated,
      userName: auth.user?.profile?.name || auth.user?.profile?.preferred_username || 'Unknown',
      userEmail: (auth.user?.profile?.email as string) || auth.user?.profile?.preferred_username || 'Unknown',
      authProvider: 'oidc',

      login: () => {
        auth.signinRedirect();
      },

      logout: () => {
        auth.signoutRedirect();
      },

      getAccessToken: async () => {
        return auth.user?.access_token || '';
      },
    }),
    [auth]
  );

  // Handle redirect callback — process ?code= from URL
  React.useEffect(() => {
    if (auth.isLoading) return;

    // If we have a code in the URL but aren't authenticated, the callback failed
    if (!auth.isAuthenticated && window.location.search.includes('code=')) {
      // react-oidc-context handles this automatically via signinCallback
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  if (auth.isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Loading authentication...</p>
    </div>;
  }

  return (
    <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
  );
}

// OIDC Auth Provider wrapper
export function OidcAuthProvider({ children }: { children: React.ReactNode }) {
  const onSigninCallback = useCallback(() => {
    // Remove ?code=, ?state= etc. from URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  return (
    <OidcProvider {...oidcConfig} onSigninCallback={onSigninCallback}>
      <OidcAuthInner>{children}</OidcAuthInner>
    </OidcProvider>
  );
}
