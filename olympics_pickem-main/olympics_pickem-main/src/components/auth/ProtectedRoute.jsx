import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loading } from '../common';

export function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, loading, isConfigured } = useAuth();
  const location = useLocation();

  // If Supabase isn't configured, allow access (fallback mode)
  if (!isConfigured) {
    return children;
  }

  // Show loading while checking auth
  if (loading) {
    return <Loading message="Checking authentication..." />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
