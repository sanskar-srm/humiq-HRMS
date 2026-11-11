import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, CalendarDays, CheckCircle2, FileSignature, Lock, Mail } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageLoader from '../../components/ui/Spinner.jsx';
import { api, getErrorMessage } from '../../services/api.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { currency, formatDate, formatDateTime } from '../../lib/format.js';

export default function OfferResponse() {
  const { token } = useParams();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const loader = useCallback(() => api.get(`/recruitment/public/offers/${token}`).then((response) => response.data), [token]);
  const offer = useApiResource(loader, [loader]);

  const acceptOffer = async () => {
    setSaving(true);
    try {
      await api.post(`/recruitment/public/offers/${token}/accept`);
      toast.success('Your offer has been accepted');
      setConfirming(false);
      offer.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      title="Your offer"
      subtitle="Review your offer details and confirm your decision securely."
      footer={(
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-slate-400" /> This link is personal and expires after seven days.</p>
          <p>Questions? Contact the HR team that sent you this offer.</p>
          <p><Link to="/login" className="font-medium text-brand-700 hover:underline">Staff sign in</Link></p>
        </div>
      )}
    >
      {offer.loading ? <PageLoader label="Loading your offer…" /> : null}
      {offer.error ? <ErrorState error={offer.error} onRetry={offer.reload} title="This offer is not available" /> : null}

      {!offer.loading && !offer.error && offer.data ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Candidate</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{offer.data.candidate_name}</h3>
              </div>
              <Badge tone={offer.data.status === 'Accepted' ? 'green' : offer.data.status === 'Issued' ? 'blue' : 'slate'}>{offer.data.status}</Badge>
            </div>

            <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Designation</dt>
                <dd className="text-right font-medium text-slate-900">{offer.data.designation}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Annual compensation</dt>
                <dd className="text-right font-medium text-slate-900">{currency(offer.data.salary, offer.data.currency)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Joining date</dt>
                <dd className="text-right font-medium text-slate-900">{formatDate(offer.data.joining_date)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">Offer expires</dt>
                <dd className="text-right font-medium text-slate-900">{formatDateTime(offer.data.expires_at)}</dd>
              </div>
            </dl>
          </div>

          {offer.data.status === 'Accepted' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Offer accepted</p>
              <p className="mt-1.5 text-xs leading-5">Your acceptance has been recorded. The HR team will contact you with onboarding details before your joining date.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileSignature className="h-4 w-4 text-brand-600" /> Ready to accept?</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">By accepting, you confirm that the designation, compensation and joining date above are correct and that you intend to join the organisation.</p>
                <Button className="mt-4 w-full" size="lg" icon={BadgeCheck} onClick={() => setConfirming(true)}>Accept this offer</Button>
              </div>
              <div className="grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
                <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Joining {formatDate(offer.data.joining_date)}</p>
                <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> HR will confirm by email</p>
              </div>
            </>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={acceptOffer}
        loading={saving}
        title="Accept this offer?"
        message={`You are accepting the ${offer.data?.designation ?? 'role'} offer at ${currency(offer.data?.salary, offer.data?.currency)} annual compensation. This decision is recorded and cannot be undone from this link.`}
        confirmLabel="Accept offer"
        danger={false}
      />
    </AuthLayout>
  );
}
