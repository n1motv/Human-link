import { useState } from 'react';
import { Copy, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import { useToast } from '../lib/toast';
import { Button, Field, Input } from './ui';

interface Props {
  /** Appelé quand la 2FA vient d'être activée et que les codes de secours ont été vus. */
  onEnabled?: () => void;
}

/** Activation / désactivation de la double authentification (TOTP). */
export function TwoFactorPanel({ onEnabled }: Props) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const cfg = useConfig();
  const toast = useToast();
  const enabled = !!user?.twoFactor?.enabled;
  const mandatory = !!user && cfg.security.require2faForRoles.includes(user.role);

  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState('');

  const fail = (e: unknown) => setError(e instanceof ApiError ? (e.code === 'INVALID_2FA_CODE' ? t('auth.invalidCode') : e.message) : t('common.error'));

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api.post('/auth/2fa/setup'));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code: code.trim() });
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode('');
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/2fa/disable', { password, code: code.trim() });
      toast.success(t('security.disabled'));
      setDisabling(false);
      setPassword('');
      setCode('');
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 font-semibold text-ok">
          <ShieldCheck size={18} /> {t('security.enabled')}
        </p>
        <p className="text-sm text-muted">{t('security.recoveryHint')}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-glass p-4 font-mono text-sm" dir="ltr">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Copy size={16} />}
            onClick={() => {
              void navigator.clipboard?.writeText(codes.join('\n'));
              toast.info(t('common.copied'));
            }}
          >
            {t('common.copy')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setCodes(null);
              onEnabled?.();
            }}
          >
            {t('security.savedCodes')}
          </Button>
        </div>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 font-semibold text-ok">
          <ShieldCheck size={18} /> {t('security.enabled')}
        </p>
        {mandatory ? (
          <p className="text-sm text-muted">{t('security.mandatory')}</p>
        ) : disabling ? (
          <div className="space-y-3">
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <Field label={t('auth.password')}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label={t('auth.code')}>
              <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => setDisabling(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" loading={busy} onClick={disable} icon={<ShieldOff size={16} />}>
                {t('security.disable')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setDisabling(true)} icon={<ShieldOff size={16} />}>
            {t('security.disable')}
          </Button>
        )}
      </div>
    );
  }

  if (setup) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 ps-5 text-sm text-muted">
          <li>{t('security.step1')}</li>
          <li>{t('security.step2')}</li>
          <li>{t('security.step3')}</li>
        </ol>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <img src={setup.qrDataUrl} alt="QR code" width={176} height={176} className="rounded-2xl bg-white p-2" />
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="text-muted">{t('security.manualKey')}</p>
            <code className="block break-all rounded-xl border border-line bg-glass px-3 py-2 font-mono text-xs" dir="ltr">
              {setup.secret}
            </code>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <Field label={t('auth.code')}>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} placeholder="123456" autoFocus autoComplete="one-time-code" />
        </Field>
        <Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={enable}>
          {t('security.confirm')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{mandatory ? t('security.required') : t('security.intro')}</p>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <Button variant="primary" loading={busy} onClick={start} icon={<Smartphone size={16} />}>
        {t('security.enable')}
      </Button>
    </div>
  );
}
