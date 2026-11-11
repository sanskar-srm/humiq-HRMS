import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, UserPlus } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { getErrorMessage } from '../../services/api.js';

const departments = ['Engineering', 'HR', 'Sales', 'Finance', 'Marketing', 'Operations'];

export default function Register() {
  const { registerEmployee } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', department: 'Engineering', designation: '',
    date_of_joining: '', password: '', confirm: '', registration_code: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Password and confirmation do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await registerEmployee({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || undefined,
        department: form.department,
        designation: form.designation || undefined,
        date_of_joining: form.date_of_joining || undefined,
        password: form.password,
        registration_code: form.registration_code,
      });
      setResult(response.data);
      toast.success('Registration submitted for HR verification');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <AuthLayout title="Registration submitted" subtitle="Your request is waiting for HR verification." footer={<Link to="/employee/login" className="font-medium text-brand-700 hover:underline">Back to employee sign in</Link>}>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <CheckCircle2 className="h-6 w-6" />
          <p className="mt-2 font-semibold">Account created — pending verification</p>
          <p className="mt-1 text-xs leading-5">
            Employee code <strong>{result.employee?.employee_code}</strong> has been reserved. An HR administrator must verify your details and activate the account before you can sign in.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Request employee access"
      subtitle="Registration requires an invitation code from HR. Accounts are activated after verification."
      footer={<p>Already registered? <Link to="/employee/login" className="font-medium text-brand-700 hover:underline">Sign in</Link> · <Link to="/login" className="font-medium text-brand-700 hover:underline">Staff sign in</Link></p>}
    >
      <form onSubmit={submit} className="space-y-3.5">
        <Input label="Full name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your full name" />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Work email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91…" />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select label="Department" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </Select>
          <Input label="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Software Engineer" />
        </div>
        <Input label="Proposed joining date" type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="At least 8 characters" />
          <Input label="Confirm password" type="password" required minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </div>
        <Input label="HR invitation code" required value={form.registration_code} onChange={(e) => setForm({ ...form, registration_code: e.target.value })} placeholder="Provided by HR" />
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
        <Button type="submit" className="w-full" size="lg" loading={loading} icon={UserPlus}>Submit registration</Button>
      </form>
    </AuthLayout>
  );
}
