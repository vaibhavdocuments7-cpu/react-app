# OIDC Implementation Details (React)

## Overview

OIDC in React is implemented using `react-oidc-context` (React wrapper) + `oidc-client-ts` (core OIDC library). This is a generic OpenID Connect library that works with any OIDC provider — Azure AD, Keycloak, Auth0, Okta, etc.

---

## 1. How OIDC Works in React — The Flow

```
User clicks "Sign in"
        │
        ▼
LoginPage → useAuthService().login()
        │
        ▼
OidcAuthProvider → auth.signinRedirect()
        │
        ▼
Library fetches OIDC Discovery Document:
GET https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration
  → Returns: authorization_endpoint, token_endpoint, jwks_uri, etc.
        │
        ▼
Browser redirects to discovered authorization_endpoint:
https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
  ?client_id=f50d4ced-...
  &response_type=code
  &redirect_uri=http://localhost:5173
  &scope=openid profile email user.read offline_access
  &code_challenge=... (PKCE)
  &state=...
  &nonce=...
        │
        ▼
User picks account → Azure AD validates
        │
        ▼
Azure AD redirects back to:
http://localhost:5173/?code=ABC123&state=XYZ789&session_state=...
        │
        ▼
React app loads → <OidcProvider> detects ?code= in URL
  → Calls onSigninCallback()
  → Exchanges code for tokens via /token endpoint
  → Validates ID token (signature, issuer, audience, nonce, iat)
  → Stores tokens in sessionStorage
  → auth.isAuthenticated becomes true
        │
        ▼
onSigninCallback clears URL params
LoginPage detects isAuthenticated → navigate('/home')
```

---

## 2. OIDC Configuration

### File: `src/services/oidc-auth.provider.tsx`

```ts
const oidcConfig = {
  authority: `https://login.microsoftonline.com/${azureAd.tenantId}/v2.0`,
  client_id: azureAd.clientId,
  redirect_uri: azureAd.redirectUri,
  post_logout_redirect_uri: azureAd.postLogoutRedirectUri,
  scope: 'openid profile email user.read offline_access',
  response_type: 'code',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  clockSkewInSeconds: 600,
};
```

### Configuration Explained:

| Setting | Purpose | Without It |
|---------|---------|-----------|
| `authority` | Base URL for OIDC discovery. Library appends `/.well-known/openid-configuration` | Library doesn't know where to find auth endpoints |
| `client_id` | Your App Registration's Client ID | Azure AD rejects — "unknown application" |
| `redirect_uri` | Where Azure AD sends user back with `?code=` | "Redirect URI mismatch" error |
| `scope` | Permissions requested (see breakdown below) | No tokens or limited claims |
| `response_type: 'code'` | Authorization Code flow with PKCE | Falls back to implicit flow (insecure) |
| `userStore` | Where tokens/state are stored | Defaults to sessionStorage but explicit is clearer |
| `clockSkewInSeconds: 600` | Allow 10-min clock difference | **"iat rejected"** error if system clock is slightly off |

### Scopes Breakdown:

| Scope | What It Does |
|-------|-------------|
| `openid` | Required for OIDC — returns ID token |
| `profile` | Adds name, preferred_username to claims |
| `email` | Adds email to claims |
| `user.read` | Permission to call Graph API `/me` |
| `offline_access` | Returns refresh token for silent renewal |

---

## 3. React OIDC Architecture

```
<OidcProvider {...oidcConfig} onSigninCallback={...}>  ← react-oidc-context provider
  <OidcAuthInner>                                       ← Our bridge component
    <AuthContext.Provider value={...}>                   ← Our unified context
      <App />                                            ← Your components
    </AuthContext.Provider>
  </OidcAuthInner>
</OidcProvider>
```

### Layer Breakdown:

| Layer | What It Does |
|-------|-------------|
| `<OidcProvider>` | react-oidc-context provider — manages OIDC UserManager, handles redirect |
| `onSigninCallback` | Called after successful code exchange — we clear URL params here |
| `<OidcAuthInner>` | Our bridge — reads from `useAuth()` hook, writes to our `AuthContext` |
| `<AuthContext.Provider>` | Our unified context — components use `useAuthService()` |

---

## 4. React OIDC Hooks Used

```ts
// Inside OidcAuthInner component:

const auth = useAuth();
// auth.isAuthenticated  — true if user has valid tokens
// auth.isLoading        — true while processing auth (checking tokens, exchanging code)
// auth.user             — User object with profile and tokens
// auth.user.profile     — ID token claims (name, email, preferred_username)
// auth.user.access_token — The access token for API calls
// auth.signinRedirect() — Trigger login
// auth.signoutRedirect() — Trigger logout
```

---

## 5. Key Methods Mapped to AuthContext

```ts
const authValue: AuthContextValue = {
  isAuthenticated: auth.isAuthenticated,
  
  userName: auth.user?.profile?.name || 'Unknown',
  userEmail: auth.user?.profile?.email || 'Unknown',
  
  login: () => {
    auth.signinRedirect();   // Redirects to Azure AD login page
  },
  
  logout: () => {
    auth.signoutRedirect();  // Redirects to Azure AD logout
  },
  
  getAccessToken: async () => {
    return auth.user?.access_token || '';  // Token stored by oidc-client-ts
  },
};
```

---

## 6. The onSigninCallback — URL Cleanup

```ts
const onSigninCallback = useCallback(() => {
  // After successful login, Azure AD redirects back with:
  // http://localhost:5173/?code=ABC&state=XYZ&session_state=...
  //
  // oidc-client-ts processes these params and exchanges the code for tokens.
  // After that, we need to clean the URL:
  window.history.replaceState({}, document.title, window.location.pathname);
  // URL becomes: http://localhost:5173/
}, []);
```

**Why this is needed:**
- Without it, the URL keeps showing `?code=...&state=...` after login
- If user refreshes, it tries to re-process the expired code → error
- Clean URLs look professional

---

## 7. Loading State Handling

```tsx
// In OidcAuthInner:
if (auth.isLoading) {
  return <div>Loading authentication...</div>;
}
```

**Why:** While `react-oidc-context` processes the redirect callback (exchanges code for tokens), `auth.isAuthenticated` is `false` and `auth.isLoading` is `true`. Without this check:
- The `<ProtectedRoute>` would see `isAuthenticated = false`
- It would redirect to login page
- The code exchange would fail

---

## 8. Differences from Angular OIDC

| Aspect | Angular OIDC | React OIDC |
|--------|-------------|------------|
| Package | `angular-auth-oidc-client` | `react-oidc-context` + `oidc-client-ts` |
| Config | `provideAuth({ config: {...} })` | `<OidcProvider {...config}>` |
| Auth state | `oidcSecurityService.checkAuth()` | `useAuth()` hook |
| Login | `oidcSecurityService.authorize()` | `auth.signinRedirect()` |
| Get token | `oidcSecurityService.getAccessToken()` | `auth.user?.access_token` |
| Redirect handling | Manual: `checkAuth(url)` | Automatic: `onSigninCallback` |
| User data | `oidcSecurityService.userData$` | `auth.user?.profile` |
| Clock skew fix | `maxIdTokenIatOffsetAllowedInSeconds` | `clockSkewInSeconds` |
| Loading state | Not built-in (manual) | `auth.isLoading` built-in |

### Key advantage of React OIDC:
`react-oidc-context` handles redirect processing automatically and provides `isLoading` state — cleaner than Angular's manual `checkAuth()` approach.

---

## 9. Token Validation — What oidc-client-ts Checks

| Check | What It Does |
|-------|-------------|
| **Signature** | Verifies JWT using Azure AD's public keys (JWKS) |
| **Issuer (`iss`)** | Must match authority URL |
| **Audience (`aud`)** | Must match client_id |
| **Expiry (`exp`)** | Token must not be expired |
| **Issued At (`iat`)** | Must be within `clockSkewInSeconds` of current time |
| **Nonce** | Must match nonce sent in authorize request |
| **State** | Must match state stored in sessionStorage |

---

## 10. Silent Token Renewal

OIDC is configured with `silentRenew` (via `offline_access` scope):

```
Token issued (lifetime ~1 hour)
        │
        ▼
Token nearing expiry
        │
        ▼
oidc-client-ts automatically uses refresh_token
  → POST to /token endpoint with grant_type=refresh_token
  → Gets new access_token + id_token
  → Stores in sessionStorage
  → No user interaction needed
```

Without `offline_access` scope, the library would use a hidden iframe for renewal, which is slower and blocked by some browsers.

---

## 11. Production Checklist

- [ ] Update `redirect_uri` to production URL
- [ ] Add production URL to Azure AD App Registration redirect URIs
- [ ] Ensure HTTPS is used (required for production)
- [ ] Test token renewal works correctly
- [ ] Consider reducing `clockSkewInSeconds` to 300 (5 min)
- [ ] Test logout flow clears all tokens
