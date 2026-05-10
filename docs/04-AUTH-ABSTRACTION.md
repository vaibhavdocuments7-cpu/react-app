# Auth Abstraction Layer — How Provider Switching Works (React)

## Overview

The React app supports two authentication libraries (MSAL and OIDC) with a single environment variable switch. Components use a unified `useAuthService()` hook — they never interact with MSAL or OIDC directly.

---

## 1. The Problem

Without abstraction, components are tightly coupled:

```tsx
// ❌ BAD — directly using MSAL
import { useMsal } from '@azure/msal-react';

function LoginPage() {
  const { instance } = useMsal();
  
  const login = () => {
    instance.loginRedirect({ scopes: ['user.read'] });
  };
}
```

Switching to OIDC means rewriting every component that touches auth.

---

## 2. The Solution — Context + Provider Pattern

### Layer 1: Interface (`auth.types.ts`)

```ts
export interface AuthContextValue {
  isAuthenticated: boolean;
  userName: string;
  userEmail: string;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string>;
  authProvider: string;
}
```

This defines WHAT auth must provide. Not HOW.

### Layer 2: Context + Hook (`auth.context.ts`)

```ts
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthService(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthService must be used within AuthProvider');
  return context;
}
```

Components call `useAuthService()` — they don't know which provider is active.

### Layer 3: Two Implementations

**MsalAuthProvider** → Wraps `@azure/msal-react` and maps to `AuthContextValue`
**OidcAuthProvider** → Wraps `react-oidc-context` and maps to `AuthContextValue`

### Layer 4: Switch (`auth.provider.tsx`)

```tsx
export function AuthProvider({ children }) {
  if (environment.authProvider === 'msal') {
    return <MsalAuthProvider>{children}</MsalAuthProvider>;
  }
  return <OidcAuthProvider>{children}</OidcAuthProvider>;
}
```

### Layer 5: Components Use the Hook

```tsx
// ✅ GOOD — decoupled from any specific library
import { useAuthService } from '../services/auth.context';

function LoginPage() {
  const { login, authProvider } = useAuthService();
  // Could be MSAL or OIDC — component doesn't know
}
```

---

## 3. How React Context Resolves It

```
                    environment.ts
                    authProvider: 'oidc'
                         │
                         ▼
                    auth.provider.tsx
          ┌─────────────────────────────┐
          │ if 'msal':                  │
          │   <MsalAuthProvider>        │
          │                             │
          │ if 'oidc':                  │
          │   <OidcAuthProvider>        │  ← This one renders
          └─────────────┬───────────────┘
                        │
          OidcAuthProvider renders:
          <AuthContext.Provider value={authValue}>
                        │
                        ▼
          ┌─────────────────────────────┐
          │ LoginPage                   │
          │ const { login } =           │
          │   useAuthService()          │ ← Gets OIDC auth value
          └─────────────────────────────┘
```

---

## 4. Angular vs React — Abstraction Comparison

| Concept | Angular | React |
|---------|---------|-------|
| **Interface** | `abstract class AuthService` | `interface AuthContextValue` |
| **Implementations** | `MsalAuthService extends AuthService` | `MsalAuthProvider` component |
| | `OidcAuthService extends AuthService` | `OidcAuthProvider` component |
| **Registration** | `{ provide: AuthService, useClass: ... }` | `<AuthContext.Provider value={...}>` |
| **Injection** | `constructor(private auth: AuthService)` | `const auth = useAuthService()` |
| **Switch** | `app.config.ts` spread operator | `auth.provider.tsx` if/else JSX |
| **Pattern** | Strategy + Dependency Injection | Strategy + Context/Provider |

### Same pattern, different syntax:

**Angular (Dependency Injection):**
```ts
// Registration
{ provide: AuthService, useClass: MsalAuthService }
// Usage
constructor(private auth: AuthService) { }
```

**React (Context/Provider):**
```tsx
// Registration
<AuthContext.Provider value={msalAuthValue}>
// Usage
const auth = useAuthService();
```

Both achieve the same goal: components get auth functions without knowing which library provides them.

---

## 5. File-by-File Explanation

### `src/config/environment.ts`
```ts
export const environment = {
  authProvider: 'oidc' as 'msal' | 'oidc',  // ⭐ THE SWITCH
  azureAd: { tenantId, clientId, redirectUri, ... },
};
```
**Purpose:** Single source of truth. Change one value to switch providers.

### `src/services/auth.types.ts`
**Purpose:** Defines the `AuthContextValue` interface — the contract that both providers must fulfill. Components only depend on this interface.

### `src/services/auth.context.ts`
**Purpose:** Creates the React Context and the `useAuthService()` hook. This is the glue between providers and components.

### `src/services/msal-auth.provider.tsx`
**Purpose:** Creates the MSAL `PublicClientApplication`, wraps it with `<MsalProvider>`, and bridges it to our `AuthContext`. Maps MSAL's `useMsal()` to our `AuthContextValue`.

### `src/services/oidc-auth.provider.tsx`
**Purpose:** Configures `oidc-client-ts`, wraps with `<OidcProvider>`, and bridges to our `AuthContext`. Maps `useAuth()` to our `AuthContextValue`. Handles URL cleanup via `onSigninCallback`.

### `src/services/auth.provider.tsx`
**Purpose:** The switch. Reads `environment.authProvider` and renders either `<MsalAuthProvider>` or `<OidcAuthProvider>`. Components below this don't know which one was chosen.

### `src/components/ProtectedRoute.tsx`
```tsx
export function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthService();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```
**Purpose:** Universal route guard. Works with both providers because it only calls `useAuthService().isAuthenticated`.

### `src/pages/LoginPage.tsx`
**Purpose:** Login page. Calls `useAuthService().login()`. Shows which provider is active via `authProvider` string. Auto-redirects to `/home` if already authenticated.

### `src/pages/HomePage.tsx`
**Purpose:** Dashboard. Calls `useAuthService().getAccessToken()` and uses it to fetch profile from Microsoft Graph API. Provider-agnostic.

### `src/App.tsx`
```tsx
<BrowserRouter>
  <AuthProvider>          {/* Switches between MSAL/OIDC */}
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/home" element={
        <ProtectedRoute><HomePage /></ProtectedRoute>
      } />
    </Routes>
  </AuthProvider>
</BrowserRouter>
```
**Purpose:** App shell. `<AuthProvider>` wraps all routes so auth is available everywhere.

---

## 6. Adding a New Auth Provider

To add Auth0 as a third option:

### Step 1: Create provider
```tsx
// src/services/auth0-auth.provider.tsx
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';

function Auth0AuthInner({ children }) {
  const auth0 = useAuth0();
  const authValue: AuthContextValue = {
    isAuthenticated: auth0.isAuthenticated,
    login: () => auth0.loginWithRedirect(),
    logout: () => auth0.logout(),
    getAccessToken: () => auth0.getAccessTokenSilently(),
    // ...
  };
  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
}
```

### Step 2: Update switch
```tsx
// src/services/auth.provider.tsx
export function AuthProvider({ children }) {
  switch (environment.authProvider) {
    case 'msal': return <MsalAuthProvider>{children}</MsalAuthProvider>;
    case 'oidc': return <OidcAuthProvider>{children}</OidcAuthProvider>;
    case 'auth0': return <Auth0AuthProvider>{children}</Auth0AuthProvider>;
  }
}
```

### Step 3: Update environment type
```ts
authProvider: 'auth0' as 'msal' | 'oidc' | 'auth0'
```

**No page/component changes needed.**

---

## 7. Trade-offs

### Pros
- ✅ Switch providers with one variable
- ✅ Components are clean — only import `useAuthService()`
- ✅ Easy to add new providers
- ✅ Easy to test — mock `AuthContext` in tests
- ✅ Same Azure AD App Registration for both

### Cons
- ⚠️ Both libraries in bundle (~120KB extra)
- ⚠️ Interface limits provider-specific features
- ⚠️ Extra abstraction layer for debugging

### Future Optimization
Use **dynamic imports** to only load the selected provider:
```tsx
const MsalAuthProvider = React.lazy(() => import('./msal-auth.provider'));
const OidcAuthProvider = React.lazy(() => import('./oidc-auth.provider'));
```

---

## 8. Design Pattern

This is the **Strategy Pattern** implemented via **React Context/Provider**:

```
┌─────────────────────────────────────────┐
│           Strategy Pattern              │
│                                         │
│  ┌────────────────┐                     │
│  │ AuthContextValue│ ← Interface        │
│  └──────┬─────────┘                     │
│         │                               │
│   ┌─────┴──────┐    ┌──────┴──────┐     │
│   │ MsalAuth   │    │  OidcAuth   │     │
│   │ Provider   │    │  Provider   │     │
│   └────────────┘    └─────────────┘     │
│                                         │
│  Selected by: environment.authProvider  │
│  Provided via: React Context            │
│  Consumed via: useAuthService() hook    │
└─────────────────────────────────────────┘
```
