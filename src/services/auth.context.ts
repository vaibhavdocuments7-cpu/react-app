import { createContext, useContext } from 'react';
import type { AuthContextValue } from './auth.types';

// Create the shared auth context
export const AuthContext = createContext<AuthContextValue | null>(null);

// Hook that components use to access auth — provider-agnostic
export function useAuthService(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthService must be used within an AuthProvider');
  }
  return context;
}
