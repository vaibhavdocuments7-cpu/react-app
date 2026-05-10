import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthService } from '../services/auth.context';

// Protected route wrapper — redirects to login if not authenticated
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthService();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
