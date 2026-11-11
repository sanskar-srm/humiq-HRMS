import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { getErrorMessage } from '../../services/api.js';

const demoPassword = import.meta.env.VITE_DEMO_PASSWORD || 'ChangeMe123!';

const demoAccounts = [
  { id: 'EMP001', name: 'Sanskar', role: 'CEO' },
  { id: 'EMP002', name: 'Himanshu', role: 'HR' },
  { id: 'EMP004', name: 'Tejas', role: 'Manager' },
  { id: 'EMP005', name: 'Emp_1', role: 'Employee' },
];

export default function Login() {
  const { user, loginStaff } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ employee_id: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await loginStaff(form.employee_id.trim(), form.password);
      toast.success('Signed in successfully');
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Staff sign in"
      subtitle="Admin, HR, managers and enabled employee accounts."
      footer={(
        <div className="space-y-2">
          <p>Employee self-service? <Link to="/employee/login" className="font-medium text-brand-700 hover:underline">Use the employee portal</Link></p>
          <p>New to the organisation? <Link to="/employee/register" className="font-medium text-brand-700 hover:underline">Request an account</Link></p>
        </div>
      )}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Employee ID"
          name="employee_id"
          placeholder="e.g. EMP001"
          autoComplete="username"
          required
          value={form.employee_id}
          onChange={(event) => setForm({ ...form, employee_id: event.target.value })}
        />
        <div>
          <label htmlFor="password" className="label">Password</label>
          <div className="relative">
            <input
              id="password"
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
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Development accounts</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {demoAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setForm({ employee_id: account.id, password: demoPassword })}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-brand-300 hover:text-brand-700"
                >
                  {account.name} &middot; {account.role} &middot; {account.id}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Password: {demoPassword} &middot; Development only</p>
          </div>
        ) : null}
      </form>
    </AuthLayout>
  );
}
