import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback /> }) {
  const { isAuthenticated, isLoadingAuth, authChecked, checkUserAuth } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (!isAuthenticated) {
    // Carry the page the member was trying to reach through login, so e.g.
    // a WhatsApp "join the auction" link that arrives while logged out (or
    // after the 30-min inactivity auto-logout) lands them back on that page
    // instead of the generic dashboard — see authReturnTo.js / Login.jsx.
    const returnTo = location.pathname + location.search;
    const target = returnTo === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`;
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
