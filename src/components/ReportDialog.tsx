import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { FacilityKey, ReportType } from '@/types';
import { Modal } from './Modal';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { FACILITY_LABELS } from '@/lib/taxonomy';
import { reportSchema } from '@/lib/validation';

const TYPES: { value: ReportType; label: string }[] = [
  { value: 'facility', label: 'A facility is wrong (Wi-Fi, charging, seating…)' },
  { value: 'noise', label: 'It’s noisier / quieter than listed' },
  { value: 'menu_price', label: 'A menu price is wrong' },
  { value: 'opening_hours', label: 'Opening hours are wrong' },
  { value: 'other', label: 'Something else' },
];

export function ReportDialog({
  open,
  onClose,
  cafeId,
  cafeName,
  initialType = 'facility',
  initialFacility = null,
}: {
  open: boolean;
  onClose(): void;
  cafeId: string;
  cafeName: string;
  initialType?: ReportType;
  initialFacility?: FacilityKey | null;
}) {
  const { community } = useData();
  const { user, configured } = useAuth();
  const toast = useToast();
  const [type, setType] = useState<ReportType>(initialType);
  const [facility, setFacility] = useState<FacilityKey | ''>(initialFacility ?? 'charging');
  const [value, setValue] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const needsLogin = configured && !user;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = reportSchema.safeParse({
      reportType: type,
      facility: type === 'facility' ? facility || null : null,
      reportedValue: value.trim() || null,
      details,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await community.submitReport({ cafeId, ...parsed.data, facility: parsed.data.facility as FacilityKey | null });
      toast.show(community.mode === 'device' ? 'Report saved on this device (demo mode — not sent anywhere)' : 'Thanks! Your report will be reviewed before anything changes.');
      setDetails('');
      setValue('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Report incorrect information">
      <p className="-mt-2 mb-4 text-sm text-mocha">
        Help keep <strong>{cafeName}</strong> accurate. Reports are reviewed. They’re shown as community-reported, never as verified fact.
      </p>
      {needsLogin ? (
        <div className="rounded-2xl bg-sand/60 p-4 text-sm">
          Please{' '}
          <Link to="/login" className="underline" onClick={onClose}>
            log in
          </Link>{' '}
          to submit a report. It helps us prevent spam.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="label">What’s wrong?</legend>
            <div className="space-y-1.5">
              {TYPES.map((t) => (
                <label key={t.value} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-cream">
                  <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="accent-espresso" />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          {type === 'facility' && (
            <label className="block">
              <span className="label">Which facility?</span>
              <select value={facility} onChange={(e) => setFacility(e.target.value as FacilityKey)} className="input !py-2.5">
                {(Object.keys(FACILITY_LABELS) as FacilityKey[]).map((f) => (
                  <option key={f} value={f}>
                    {FACILITY_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(type === 'facility' || type === 'menu_price' || type === 'opening_hours') && (
            <label className="block">
              <span className="label">What did you find? <span className="font-normal text-latte">(optional)</span></span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={120}
                className="input !py-2.5"
                placeholder={type === 'menu_price' ? 'e.g. Cappuccino is now ₹180' : type === 'opening_hours' ? 'e.g. Closes at 9 pm on Sundays' : 'e.g. No sockets near any table'}
              />
            </label>
          )}
          <label className="block">
            <span className="label">Details</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} className="input" placeholder="When did you visit, and what did you notice?" />
          </label>
          {error && <p className="text-sm text-clay">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={sending}>
            {sending ? 'Sending…' : 'Submit report'}
          </button>
        </form>
      )}
    </Modal>
  );
}
