import React, { useMemo } from 'react';
import {
  PublicClientApplication,
} from '@azure/msal-browser';
import type { AccountInfo } from '@azure/msal-browser';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { AuthContext } from './auth.context';
import type { AuthContextValue } from './auth.types';
import { environment } from '../config/environment';

const azureAd = environment.azureAd;

// Create MSAL instance (singleton)
const msalInstance = new PublicClientApplication({
  auth: {
    clientId: azureAd.clientId,
    authority: `https://login.microsoftonline.com/${azureAd.tenantId}`,
    redirectUri: azureAd.redirectUri,
    postLogoutRedirectUri: azureAd.postLogoutRedirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
});

// Inner component that provides auth context values
function MsalAuthInner({ children }: { children: React.ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const account: AccountInfo | null = accounts[0] || null;

  const authValue: AuthContextValue = useMemo(
    () => ({
      isAuthenticated,
      userName: account?.name || 'Unknown',
      userEmail: account?.username || 'Unknown',
      authProvider: 'msal',

      login: () => {
        instance.loginRedirect({ scopes: ['user.read'] });
      },

      logout: () => {
        instance.logoutRedirect();
      },

      getAccessToken: async () => {
        if (!account) return '';
        try {
          const response = await instance.acquireTokenSilent({
            scopes: ['user.read'],
            account: account,
          });
          return response.accessToken;
        } catch (err) {
          console.error('MSAL token acquisition failed:', err);
          return '';
        }
      },
    }),
    [isAuthenticated, account, instance]
  );

  return (
    <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
  );
}

// MSAL Auth Provider wrapper
export function MsalAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuthInner>{children}</MsalAuthInner>
    </MsalProvider>
  );
}
