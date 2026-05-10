# React App — Project Setup Guide

## Overview

This document explains how the React project was created, including project setup, dependencies, folder structure, and Azure AD configuration.

---

## 1. Prerequisites

| Tool     | Version   | Install Command                          |
|----------|-----------|------------------------------------------|
| Node.js  | v22.x LTS | Install via [nvm-windows](https://github.com/coreybutler/nvm-windows) |
| npm      | v10+      | Comes with Node.js                       |

---

## 2. Project Creation

We used **Vite** (not Create React App which is deprecated):

```bash
# Navigate to parent directory
cd C:\Users\v-vaibhavg\OneDrive - Microsoft\Desktop\terraform\angularproject

# Create React + TypeScript project using Vite
npm create vite@latest react-app -- --template react-ts

# Navigate into the project
cd react-app

# Install dependencies
npm install
```

### Why Vite over Create React App (CRA)?

| Feature            | CRA (deprecated)       | Vite                     |
|--------------------|------------------------|--------------------------|
| Build speed        | Slow (Webpack)         | Fast (Rolldown/ESBuild)  |
| Dev server startup | 10-30 seconds          | < 1 second               |
| Hot reload         | Slow                   | Instant (HMR)            |
| Maintenance        | ❌ Deprecated          | ✅ Actively maintained    |
| Bundle size        | Larger                 | Smaller (tree-shaking)   |

---

## 3. Dependencies Installed

### Authentication Libraries

```bash
# MSAL — Microsoft's official auth library for React
npm install @azure/msal-browser @azure/msal-react

# OIDC — Generic OpenID Connect library
npm install react-oidc-context oidc-client-ts

# Routing
npm install react-router-dom
```

### Installed Versions

| Package              | Version | Purpose                              |
|---------------------|---------|--------------------------------------|
| @azure/msal-browser | 5.x     | Core MSAL library                    |
| @azure/msal-react   | 2.x     | React hooks/components for MSAL      |
| react-oidc-context  | 3.x     | React wrapper for oidc-client-ts     |
| oidc-client-ts      | 3.x     | Core OIDC client library             |
| react-router-dom    | 7.x     | Client-side routing                  |
| vite                | 8.x     | Build tool and dev server            |

---

## 4. Project Structure

```
react-app/
├── docs/                              # Documentation
│   ├── 01-PROJECT-SETUP.md            # This file
│   ├── 02-MSAL-IMPLEMENTATION.md      # MSAL auth details
│   ├── 03-OIDC-IMPLEMENTATION.md      # OIDC auth details
│   └── 04-AUTH-ABSTRACTION.md         # How switching works
├── src/
│   ├── config/
│   │   └── environment.ts             # ⭐ Auth provider switch + Azure AD config
│   ├── services/
│   │   ├── auth.types.ts              # AuthContextValue interface
│   │   ├── auth.context.ts            # React Context + useAuthService() hook
│   │   ├── auth.provider.tsx          # ⭐ Switch — loads MSAL or OIDC provider
│   │   ├── msal-auth.provider.tsx     # MSAL implementation
│   │   └── oidc-auth.provider.tsx     # OIDC implementation
│   ├── components/
│   │   └── ProtectedRoute.tsx         # Route guard (redirects if not authenticated)
│   ├── pages/
│   │   ├── LoginPage.tsx              # Login page with Microsoft sign-in button
│   │   └── HomePage.tsx               # Dashboard (protected) + Graph API call
│   ├── App.tsx                        # Routes and AuthProvider wrapper
│   ├── main.tsx                       # App entry point
│   └── index.css                      # Global styles
├── index.html                         # HTML entry point
├── vite.config.ts                     # Vite configuration
├── tsconfig.json                      # TypeScript config
└── package.json
```

---

## 5. Azure AD App Registration

The app uses the same App Registration as the Angular app.

| Setting              | Value                                          |
|---------------------|------------------------------------------------|
| App Name            | angularlogin                                   |
| Client ID           | `f50d4ced-edfb-4ce9-b4e1-2bebf771e699`        |
| Tenant ID           | `79e7043b-2d89-4454-9f07-1d8ceb3f0399`        |
| Platform            | Single-page application (SPA)                  |
| Redirect URIs       | `http://localhost:4200` (Angular)              |
|                     | `http://localhost:5173` (React — **must add**) |

### ⚠️ Important: Add React Redirect URI

You must add `http://localhost:5173` as a redirect URI in Azure Portal:

1. Go to **Azure Portal** → **Entra ID** → **App Registrations** → **angularlogin**
2. Click **Authentication**
3. Under **Single-page application** → **Add URI**
4. Add: `http://localhost:5173`
5. Click **Save**

---

## 6. Running the App

```bash
# Development server (with hot reload)
npm run dev
# App available at: http://localhost:5173

# Build for production
npm run build
# Output in: dist/

# Preview production build
npm run preview
```

---

## 7. Switching Auth Provider

Open `src/config/environment.ts` and change:

```ts
// Use OIDC (react-oidc-context + oidc-client-ts)
authProvider: 'oidc'

// Use MSAL (Microsoft Authentication Library)
authProvider: 'msal'
```

No other code changes needed. Restart the dev server after changing.

---

## 8. Differences from Angular App

| Aspect              | Angular                          | React                            |
|--------------------|----------------------------------|----------------------------------|
| Build tool         | Angular CLI (`ng serve`)         | Vite (`npm run dev`)             |
| Port               | 4200                             | 5173                             |
| Auth abstraction   | Abstract class + DI              | React Context + Provider pattern |
| Route guard        | `canActivate` function           | `<ProtectedRoute>` wrapper       |
| State management   | Services + RxJS Observables      | React hooks + useState           |
| Template syntax    | HTML templates + directives      | JSX/TSX inline                   |
| Styling            | Separate CSS files               | Inline styles (CSS-in-JS)        |

---

## 9. StrictMode Disabled

React's `StrictMode` was disabled in `main.tsx`:

```ts
// StrictMode removed — it causes MSAL to initialize twice in development
// (double-invokes effects), which leads to auth issues
createRoot(document.getElementById('root')!).render(<App />);
```

In production builds, StrictMode has no effect anyway.
