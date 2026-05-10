# MSAL Implementation Details (React)

## Overview

MSAL (Microsoft Authentication Library) for React uses `@azure/msal-react` which provides React hooks and components built on top of `@azure/msal-browser`. Unlike Angular's service-based approach, React uses the **Provider + Hook** pattern.

---

## 1. How MSAL Works in React — The Flow

```
User clicks "Sign in"
        │
        ▼
LoginPage → useAuthService().login()
        │
        ▼
MsalAuthProvider → instance.loginRedirect({ scopes: ['user.read'] })
        │
        ▼
Browser redirects to:
https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
  ?client_id=f50d4ced-...
  &response_type=code
  &redirect_uri=http://localhost:5173
  &scope=openid profile user.read
  &code_challenge=... (PKCE)
  &state=...
        │
        ▼
User picks Microsoft account → Azure AD validates
        │
        ▼
Azure AD redirects back to:
http://localhost:5173/?code=ABC123&state=XYZ789
        │
        ▼
React app loads → <MsalProvider> initializes
  → MSAL automatically processes ?code= and ?state=
  → Exchanges code for tokens
  → useMsal() hook updates with account info
        │
        ▼
LoginPage detects isAuthenticated=true → navigate('/home')
```

---

## 2. MSAL Configuration

### File: `src/services/msal-auth.provider.tsx`

```ts
const msalInstance = new PublicClientApplication({
  auth: {
    clientId: azureAd.clientId,
    authority: `https://login.microsoftonline.com/${azureAd.tenantId}`,
    redirectUri: azureAd.redirectUri,           // http://localhost:5173
    postLogoutRedirectUri: azureAd.postLogoutRedirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
});
```

### Configuration Explained:

| Setting | Purpose | Without It |
|---------|---------|-----------|
| `clientId` | Identifies your app to Azure AD | Azure AD rejects — "unknown application" |
| `authority` | Azure AD tenant endpoint | MSAL doesn't know where to authenticate |
| `redirectUri` | Where Azure AD sends user back | "Redirect URI mismatch" error |
| `cacheLocation: 'sessionStorage'` | Where tokens are stored | Defaults to sessionStorage; explicit is clearer |

---

## 3. React MSAL Architecture

```
<MsalProvider instance={msalInstance}>     ← Microsoft's provider
  <MsalAuthInner>                          ← Our bridge component
    <AuthContext.Provider value={...}>      ← Our unified context
      <App />                              ← Your components
    </AuthContext.Provider>
  </MsalAuthInner>
</MsalProvider>
```

### Layer Breakdown:

| Layer | What It Does |
|-------|-------------|
| `<MsalProvider>` | Microsoft's React provider — manages MSAL instance, handles redirects automatically |
| `<MsalAuthInner>` | Our bridge — reads from `useMsal()` hook and writes to our `AuthContext` |
| `<AuthContext.Provider>` | Our unified context — components use `useAuthService()` to access auth |

---

## 4. MSAL React Hooks Used

```ts
// Inside MsalAuthInner component:

const { instance, accounts, inProgress } = useMsal();
// instance    = PublicClientApplication (for login/logout/token)
// accounts    = Array of logged-in accounts
// inProgress  = Current interaction status (None, Login, Logout, etc.)

const isAuthenticated = useIsAuthenticated();
// true if at least one account exists in MSAL cache
```

---

## 5. Key Methods Mapped to AuthContext

```ts
const authValue: AuthContextValue = {
  isAuthenticated,   // From useIsAuthenticated() hook
  
  userName: account?.name || 'Unknown',      // From MSAL account object
  userEmail: account?.username || 'Unknown',  // From MSAL account object
  
  login: () => {
    instance.loginRedirect({ scopes: ['user.read'] });
  },
  
  logout: () => {
    instance.logoutRedirect();
  },
  
  getAccessToken: async () => {
    const response = await instance.acquireTokenSilent({
      scopes: ['user.read'],
      account: account,
    });
    return response.accessToken;
  },
};
```

---

## 6. How Token Acquisition Works

```
Component calls getAccessToken()
        │
        ▼
acquireTokenSilent({ scopes, account })
        │
        ├── Token in cache + not expired? → Return cached token
        │
        ├── Token expired + refresh token available? → Use refresh token
        │                                              → Get new tokens from /token endpoint
        │                                              → Return new access token
        │
        └── No tokens at all? → Throw error
                                → Fallback: acquireTokenRedirect() (full page redirect)
```

---

## 7. Differences from Angular MSAL

| Aspect | Angular MSAL | React MSAL |
|--------|-------------|------------|
| Package | `@azure/msal-angular` | `@azure/msal-react` |
| Auth state | `MsalService` + `MsalBroadcastService` | `useMsal()` + `useIsAuthenticated()` hooks |
| Provider | DI: `{ provide: MSAL_INSTANCE, ... }` | JSX: `<MsalProvider instance={...}>` |
| Redirect handling | Manual: `handleRedirectObservable()` | Automatic: `<MsalProvider>` handles it |
| Interceptor | `MsalInterceptor` (auto-attaches tokens) | Manual: `acquireTokenSilent()` in each call |
| Guard | `MsalGuard` canActivate | `<ProtectedRoute>` wrapper component |
| Init required | Yes: `initialize().subscribe()` | No: `<MsalProvider>` auto-initializes |

### Key advantage of React MSAL:
`<MsalProvider>` automatically handles the redirect callback — no manual `handleRedirectObservable()` needed. This avoids the `state_mismatch` issues we had in Angular.

---

## 8. Security Considerations

- **StrictMode disabled** — React StrictMode double-invokes effects in development, which causes MSAL to initialize twice and leads to auth errors. Disabled in `main.tsx`.
- **Tokens in sessionStorage** — Cleared when browser tab closes
- **PKCE automatically used** — `@azure/msal-browser` handles code_challenge/code_verifier
- **acquireTokenSilent()** — Always try silent first; redirect only if necessary
- **useMemo for auth value** — Prevents unnecessary re-renders when auth state doesn't change
