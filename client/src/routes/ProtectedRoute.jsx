import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import PageLoader from '../components/ui/Spinner.jsx';
import { tokenStore } from '../services/api.js';
import { Link } from 'react-router-dom';

export function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) {
    const loginPath = tokenStore.getPortal() === 'employee' ? '/employee/login' : '/login';
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="rounded-full bg-rose-50 p-4 text-rose-500"><ShieldAlert className="h-8 w-8" /></div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-1 max-w-md text-sm text-slate-500">Your role ({user.role}) does not have permission to open this page. Server-side authorization applies to every API request as well.</p>
        <Link to="/dashboard" className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Return to dashboard</Link>
      </div>
    );
  }
  return children;
}

export default ProtectedRoute;
