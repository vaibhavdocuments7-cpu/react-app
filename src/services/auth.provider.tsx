import React from 'react';
import { environment } from '../config/environment';
import { MsalAuthProvider } from './msal-auth.provider';
import { OidcAuthProvider } from './oidc-auth.provider';

// ============================================================================
// Auth Provider Switch — selects MSAL or OIDC based on environment variable
// ============================================================================
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (environment.authProvider === 'msal') {
    return <MsalAuthProvider>{children}</MsalAuthProvider>;
  }
  return <OidcAuthProvider>{children}</OidcAuthProvider>;
}
