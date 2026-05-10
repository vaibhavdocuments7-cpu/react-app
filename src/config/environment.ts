// ============================================================================
// Environment Configuration
// ============================================================================
// Switch authProvider to change authentication library:
//   'msal'   = Microsoft Authentication Library (Microsoft's official SDK)
//   'oidc'   = react-oidc-context + oidc-client-ts (generic OpenID Connect)
//   'manual' = Pure OAuth 2.0 + PKCE (no library — just fetch() calls)
// All three use the SAME Azure AD App Registration — no portal changes needed

export const environment = {
  production: false,

  // ⭐ CHANGE THIS to switch auth provider
  authProvider: 'manual' as 'msal' | 'oidc' | 'manual',

  // Azure AD App Registration (shared by all providers)
  azureAd: {
    tenantId: '79e7043b-2d89-4454-9f07-1d8ceb3f0399',
    clientId: 'f50d4ced-edfb-4ce9-b4e1-2bebf771e699',
    redirectUri: 'http://localhost:5173',
    postLogoutRedirectUri: 'http://localhost:5173',
    scopes: ['openid', 'profile', 'email', 'user.read'],
  },
};
