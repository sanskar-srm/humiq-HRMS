import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import Login from './pages/auth/Login.jsx';
import EmployeeLogin from './pages/auth/EmployeeLogin.jsx';
import Register from './pages/auth/Register.jsx';
import NotFound from './pages/NotFound.jsx';
import Dashboard from './pages/dashboard/Dashboard.jsx';
import Employees from './pages/employees/Employees.jsx';
import Workforce from './pages/workforce/Workforce.jsx';
import Recruitment from './pages/recruitment/Recruitment.jsx';
import Onboarding from './pages/onboarding/Onboarding.jsx';
import Offboarding from './pages/offboarding/Offboarding.jsx';
import Attendance from './pages/attendance/Attendance.jsx';
import Compensation from './pages/compensation/Compensation.jsx';
import Payroll from './pages/payroll/Payroll.jsx';
import Performance from './pages/performance/Performance.jsx';
import Helpdesk from './pages/helpdesk/Helpdesk.jsx';
import Engagement from './pages/engagement/Engagement.jsx';
import Relations from './pages/relations/Relations.jsx';
import Lms from './pages/lms/Lms.jsx';
import OfferResponse from './pages/public/OfferResponse.jsx';
import PageLoader from './components/ui/Spinner.jsx';

const STAFF = ['Admin', 'HR', 'Manager'];
const ALL = ['Admin', 'HR', 'Manager', 'Employee'];

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/employee/login" element={<EmployeeLogin />} />
      <Route path="/employee/register" element={<Register />} />
      <Route path="/offer/:token" element={<OfferResponse />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        element={(
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        )}
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/employees" element={<ProtectedRoute roles={STAFF}><Employees /></ProtectedRoute>} />
        <Route path="/workforce" element={<ProtectedRoute roles={STAFF}><Workforce /></ProtectedRoute>} />
        <Route path="/recruitment" element={<ProtectedRoute roles={STAFF}><Recruitment /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute roles={ALL}><Onboarding /></ProtectedRoute>} />
        <Route path="/offboarding" element={<ProtectedRoute roles={ALL}><Offboarding /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute roles={ALL}><Attendance /></ProtectedRoute>} />
        <Route path="/compensation" element={<ProtectedRoute roles={ALL}><Compensation /></ProtectedRoute>} />
        <Route path="/payroll" element={<ProtectedRoute roles={ALL}><Payroll /></ProtectedRoute>} />
        <Route path="/performance" element={<ProtectedRoute roles={ALL}><Performance /></ProtectedRoute>} />
        <Route path="/helpdesk" element={<ProtectedRoute roles={ALL}><Helpdesk /></ProtectedRoute>} />
        <Route path="/engagement" element={<ProtectedRoute roles={ALL}><Engagement /></ProtectedRoute>} />
        <Route path="/relations" element={<ProtectedRoute roles={ALL}><Relations /></ProtectedRoute>} />
        <Route path="/lms" element={<ProtectedRoute roles={ALL}><Lms /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
