import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { getErrorMessage } from '../../services/api.js';

const demoEmployee = {
  email: import.meta.env.VITE_DEMO_EMPLOYEE_EMAIL || 'emp1@hrms.local',
  password: import.meta.env.VITE_DEMO_PASSWORD || 'ChangeMe123!',
};

export default function EmployeeLogin() {
  const { user, loginEmployee } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await loginEmployee(form.email.trim(), form.password);
      toast.success('Welcome to your employee portal');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Employee sign in"
      subtitle="Access your payslips, attendance, goals and HR support."
      footer={(
        <div className="space-y-2">
          <p>Staff member? <Link to="/login" className="font-medium text-brand-700 hover:underline">Use the staff sign-in</Link></p>
          <p>Need an account? <Link to="/employee/register" className="font-medium text-brand-700 hover:underline">Request employee access</Link></p>
        </div>
      )}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Work email" type="email" name="email" autoComplete="email" required placeholder="you@company.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <div>
          <label htmlFor="employee-password" className="label">Password</label>
          <div className="relative">
            <input
              id="employee-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className="input pr-10"
              placeholder="Enter your password"
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Toggle password visibility">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
        <Button type="submit" className="w-full" size="lg" loading={loading} icon={LogIn}>Sign in</Button>
        {import.meta.env.DEV ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500">
            Development employee: <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setForm({ email: demoEmployee.email, password: demoEmployee.password })}>{demoEmployee.email}</button> &middot; {demoEmployee.password}
          </div>
        ) : null}
      </form>
    </AuthLayout>
  );
}
