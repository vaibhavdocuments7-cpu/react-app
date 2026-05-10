# Manual OAuth 2.0 Implementation Details (React)

## Overview

This is a **zero-library** OAuth 2.0 Authorization Code + PKCE implementation. No MSAL, no OIDC library — just pure `fetch()` calls to Azure AD endpoints. This gives you **full control** and **full understanding** of every step.

---

## 1. The Complete Flow — Step by Step

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION PHASE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 1: Generate PKCE values (in browser)                  │
│  ┌──────────────────────────────────────┐                   │
│  │ code_verifier  = random(64 bytes)    │ → stored in       │
│  │ code_challenge = SHA256(verifier)    │   sessionStorage   │
│  │ state          = random(32 bytes)    │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  Step 2: Redirect browser to Azure AD                       │
│  ┌──────────────────────────────────────┐                   │
│  │ GET /authorize                       │                   │
│  │   ?client_id=f50d4ced-...            │                   │
│  │   &response_type=code                │                   │
│  │   &redirect_uri=localhost:5173       │                   │
│  │   &scope=openid profile user.read    │                   │
│  │   &code_challenge=abc123...          │ ← SHA256 hash     │
│  │   &code_challenge_method=S256        │                   │
│  │   &state=xyz789...                   │ ← CSRF protection │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  Step 3: User logs in at Microsoft                          │
│  ┌──────────────────────────────────────┐                   │
│  │ User picks account                   │                   │
│  │ User enters password                 │                   │
│  │ User consents to permissions         │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  Step 4: Azure AD redirects back with code                  │
│  ┌──────────────────────────────────────┐                   │
│  │ http://localhost:5173                 │                   │
│  │   ?code=AUTHORIZATION_CODE           │ ← one-time code   │
│  │   &state=xyz789...                   │ ← must match!     │
│  │   &session_state=...                 │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    TOKEN EXCHANGE PHASE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 5: Validate state (CSRF check)                        │
│  ┌──────────────────────────────────────┐                   │
│  │ state from URL === state from        │                   │
│  │ sessionStorage?                      │                   │
│  │   YES → proceed                      │                   │
│  │   NO  → abort (possible attack!)     │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  Step 6: Exchange code for tokens                           │
│  ┌──────────────────────────────────────┐                   │
│  │ POST /token                          │                   │
│  │ Content-Type: x-www-form-urlencoded  │                   │
│  │                                      │                   │
│  │ client_id=f50d4ced-...               │                   │
│  │ grant_type=authorization_code        │                   │
│  │ code=AUTHORIZATION_CODE              │ ← from URL        │
│  │ redirect_uri=localhost:5173          │                   │
│  │ code_verifier=original_random_value  │ ← PKCE proof      │
│  │ scope=openid profile user.read      │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  Step 7: Azure AD validates & responds                      │
│  ┌──────────────────────────────────────┐                   │
│  │ Azure AD checks:                     │                   │
│  │ ✓ code is valid and not expired      │                   │
│  │ ✓ SHA256(code_verifier) matches      │                   │
│  │   the code_challenge from Step 2     │                   │
│  │ ✓ redirect_uri matches               │                   │
│  │                                      │                   │
│  │ Returns:                             │                   │
│  │ {                                    │                   │
│  │   "access_token": "eyJ...",          │ ← for API calls   │
│  │   "id_token": "eyJ...",              │ ← user identity   │
│  │   "refresh_token": "0.ARo...",       │ ← for renewal     │
│  │   "expires_in": 3600,                │ ← 1 hour          │
│  │   "token_type": "Bearer"             │                   │
│  │ }                                    │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  Step 8: Store tokens, clean URL, show dashboard            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. PKCE (Proof Key for Code Exchange) — Explained

### Why PKCE exists:
Without PKCE, if an attacker intercepts the `?code=` from the URL (via browser history, referrer headers, or malware), they could exchange it for tokens. PKCE prevents this.

### How it works:

```
BEFORE redirect (Step 1):
  code_verifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"  (random)
  code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"  (SHA256 of verifier)
  
  → Send code_challenge to Azure AD (Step 2)
  → Store code_verifier in sessionStorage

AFTER redirect (Step 6):
  → Send code_verifier to Azure AD with the authorization code
  → Azure AD computes SHA256(code_verifier)
  → Compares with code_challenge from Step 2
  → If they match → tokens issued
  → If not → rejected

ATTACKER scenario:
  → Attacker steals the ?code= from URL
  → Attacker tries to exchange code for tokens
  → But attacker doesn't have code_verifier (it's in YOUR sessionStorage)
  → Azure AD rejects: SHA256(???) ≠ code_challenge
  → Attack fails ✓
```

### Code:

```ts
// Generate random bytes
function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);        // Cryptographically secure random
  return base64UrlEncode(array);
}

// SHA-256 hash using Web Crypto API
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}
```

---

## 3. State Parameter — CSRF Protection

### Why state exists:
Without state, an attacker could:
1. Start an OAuth flow on THEIR account
2. Get a `?code=` for their account
3. Trick YOU into visiting `localhost:5173/?code=ATTACKER_CODE`
4. Your app exchanges the code → you're logged in as the ATTACKER
5. You upload sensitive files → attacker sees them

### How state prevents this:

```
BEFORE redirect:
  state = random("xyz789")  → stored in YOUR sessionStorage

AFTER redirect:
  URL has ?state=xyz789
  Check: URL state === sessionStorage state?
    YES → this is YOUR flow, proceed
    NO  → someone injected a code, ABORT!
```

---

## 4. Token Types Explained

### Access Token (`access_token`)
- **Purpose:** Call APIs (e.g., Microsoft Graph `/me`)
- **Format:** JWT (JSON Web Token) — `eyJhbGciOiJSUzI1Ni...`
- **Lifetime:** ~1 hour (Azure AD default)
- **Usage:** `Authorization: Bearer <access_token>`
- **Contains:** User ID, scopes, audience, expiry

### ID Token (`id_token`)
- **Purpose:** Identify the user (name, email)
- **Format:** JWT
- **Usage:** Decode to get user claims (name, email, preferred_username)
- **Not for API calls** — only for reading user identity

### Refresh Token (`refresh_token`)
- **Purpose:** Get new access/ID tokens when they expire
- **Format:** Opaque string (not a JWT)
- **Lifetime:** 24 hours - 90 days (configurable)
- **Usage:** POST to /token with `grant_type=refresh_token`

---

## 5. Token Refresh Flow

```
Access token expires (after ~1 hour)
        │
        ▼
getAccessToken() checks: Date.now() > expires_at?
        │
        ▼ YES
POST /token
  client_id=f50d4ced-...
  grant_type=refresh_token         ← different grant_type!
  refresh_token=0.ARoAOwTn...     ← the refresh token
  scope=openid profile user.read
        │
        ▼
Azure AD returns new tokens:
{
  "access_token": "eyJ...(new)",
  "id_token": "eyJ...(new)",
  "refresh_token": "0.ARo...(new)",  ← rotated!
  "expires_in": 3600
}
        │
        ▼
Store new tokens, return new access_token
```

---

## 6. JWT Decoding — How We Read User Info

```ts
// ID Token is a JWT: HEADER.PAYLOAD.SIGNATURE
// Example: eyJhbGci.eyJuYW1l.SflKxwRJ

function decodeJwt(token: string): Record<string, any> {
  const payload = token.split('.')[1];           // Get middle part
  const decoded = atob(payload);                  // Base64 decode
  return JSON.parse(decoded);                     // Parse JSON
}

// Result:
{
  "name": "Vaibhav G",
  "preferred_username": "v-vaibhavg@microsoft.com",
  "email": "vaibhav@example.com",
  "aud": "f50d4ced-...",          // audience = your client_id
  "iss": "https://login.microsoftonline.com/.../v2.0",
  "iat": 1715350000,              // issued at
  "exp": 1715353600,              // expires at
  "sub": "abc123...",             // unique user ID
}
```

**Note:** We do NOT validate the JWT signature in the manual flow. In production, you should verify it using Azure AD's public keys (JWKS). MSAL and OIDC libraries do this automatically.

---

## 7. Azure AD Endpoints Used

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Authorize | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` | Start login — user picks account |
| Token | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` | Exchange code for tokens |
| Logout | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/logout` | End session |

These are the same endpoints that MSAL and OIDC libraries call internally. The manual flow just calls them directly with `fetch()`.

---

## 8. Comparison: Manual vs MSAL vs OIDC

| Feature | Manual | MSAL | OIDC |
|---------|--------|------|------|
| Dependencies | **Zero** | @azure/msal-browser + msal-react | react-oidc-context + oidc-client-ts |
| Bundle size impact | **None** | ~120KB | ~80KB |
| PKCE | Manual implementation | Automatic | Automatic |
| Token refresh | Manual implementation | Automatic | Automatic |
| JWT validation | ❌ Not done (see note) | ✅ Full validation | ✅ Full validation |
| State/CSRF protection | Manual implementation | Automatic | Automatic |
| Redirect handling | Manual URL parsing | Automatic | Automatic |
| Silent renew (iframe) | ❌ Not implemented | ✅ Built-in | ✅ Built-in |
| Multi-tab support | ❌ Basic | ✅ Broadcast channel | ✅ Built-in |
| Learning value | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Production readiness | ⚠️ Needs hardening | ✅ Ready | ✅ Ready |

### When to use Manual:
- Learning OAuth 2.0 flow in depth
- Minimal bundle size requirement
- Full control over every HTTP call
- Environments where third-party libraries are restricted

### When NOT to use Manual:
- Production apps (missing JWT signature validation, multi-tab sync)
- Apps requiring silent token renewal via hidden iframe
- High-security environments

---

## 9. Security: What's Missing vs Libraries

| Security Feature | Manual | MSAL/OIDC Libraries |
|-----------------|--------|---------------------|
| PKCE | ✅ Implemented | ✅ Automatic |
| State/CSRF | ✅ Implemented | ✅ Automatic |
| JWT signature verification | ❌ Missing | ✅ Validates using JWKS |
| Token expiry check | ✅ Implemented | ✅ Automatic |
| Nonce validation | ❌ Missing | ✅ Automatic |
| Issuer validation | ❌ Missing | ✅ Automatic |
| Audience validation | ❌ Missing | ✅ Automatic |
| Clock skew handling | ❌ Missing | ✅ Configurable |

**To make manual production-ready**, you'd need to add:
1. Fetch Azure AD's public keys from JWKS endpoint
2. Validate JWT signature using those keys
3. Validate issuer, audience, nonce, and expiry claims
4. Handle clock skew

---

## 10. File: `manual-auth.provider.tsx` — Code Structure

```
manual-auth.provider.tsx
│
├── PKCE Helper Functions
│   ├── generateCodeVerifier()      → Random 64 bytes → Base64URL
│   ├── generateCodeChallenge()     → SHA-256(verifier) → Base64URL
│   ├── generateState()             → Random 32 bytes → Base64URL
│   └── base64UrlEncode()           → URL-safe Base64 encoding
│
├── JWT Decoder
│   └── decodeJwt()                 → Split JWT → Base64 decode → JSON parse
│
└── ManualAuthProvider Component
    ├── State: accessToken, idToken, isLoading
    │
    ├── useEffect (on mount)
    │   └── Check URL for ?code= → exchangeCodeForTokens()
    │
    ├── login()
    │   ├── Generate PKCE (verifier + challenge)
    │   ├── Generate state
    │   ├── Store in sessionStorage
    │   └── window.location.href = authorize URL
    │
    ├── exchangeCodeForTokens(code)
    │   ├── Validate state
    │   ├── POST /token with code + code_verifier
    │   ├── Store tokens in sessionStorage
    │   └── Clean URL params
    │
    ├── logout()
    │   ├── Clear sessionStorage
    │   └── Redirect to /logout endpoint
    │
    ├── getAccessToken()
    │   ├── Check if token expired
    │   ├── If expired → POST /token with refresh_token
    │   └── Return access_token
    │
    └── Render <AuthContext.Provider value={authValue}>
```
