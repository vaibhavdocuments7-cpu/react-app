import React from 'react';
import { environment } from '../config/environment';
import { MsalAuthProvider } from './msal-auth.provider';
import { OidcAuthProvider } from './oidc-auth.provider';
import { ManualAuthProvider } from './manual-auth.provider';

// ============================================================================
// Auth Provider Switch — selects provider based on environment variable
// ============================================================================
export function AuthProvider({ children }: { children: React.ReactNode }) {
  switch (environment.authProvider) {
    case 'msal':
      return <MsalAuthProvider>{children}</MsalAuthProvider>;
    case 'oidc':
      return <OidcAuthProvider>{children}</OidcAuthProvider>;
    case 'manual':
      return <ManualAuthProvider>{children}</ManualAuthProvider>;
  }
}
