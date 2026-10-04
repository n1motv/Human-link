import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/AuthShell';
import { Button, Field, Input } from '../../components/ui';
import { OtpInput, type OtpStatus } from '../../components/OtpInput';
import { HOME } from '../../app/nav';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSessionFlow } from '../../app/SessionFlow';
import type { User } from '../../lib/types';

type LoginResponse = { twoFactorRequired: true; challenge: string } | { user: User; pending2fa: boolean };

export default function Login() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { signIn } = useSessionFlow();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [show, setShow] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpStatus, setOtpStatus] = useState<OtpStatus>('idle');
  const [recovery, setRecovery] = useState(false);

  const schema = z.object({ email: z.email(t('validation.email')), password: z.string().min(1, t('validation.required')), code: z.string().optional() });
  type F = z.infer<typeof schema>;
  const { register, handleSubmit, formState } = useForm<F>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={from ?? HOME[user.role]} replace />;

  const done = (r: { user: User; pending2fa: boolean }) => void signIn(r, from);

  const reason = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : '';
    if (code === 'CHALLENGE_EXPIRED') setChallenge(null);
    return code === 'INVALID_2FA_CODE' ? t('auth.invalidCode') : code === 'RATE_LIMITED' ? t('auth.tooMany') : e instanceof ApiError && e.status < 500 ? t('auth.invalidCredentials') : t('common.error');
  };

  const verifyOtp = async (code: string) => {
    setError(null);
    setOtpStatus('checking');
    try {
      const r = await api.post<{ user: User; pending2fa: boolean }>('/auth/2fa/login', { challenge, code }, { noRefresh: true });
      setOtpStatus('success');
      setTimeout(() => done(r), 700);
    } catch (e) {
      setOtpStatus('error');
      setError(reason(e));
    }
  };

  const onSubmit = async (v: F) => {
    setError(null);
    try {
      if (challenge) {
        if (!recovery) return void (await verifyOtp(otp));
        done(await api.post('/auth/2fa/login', { challenge, code: v.code?.trim() ?? '' }, { noRefresh: true }));
        return;
      }
      const r = await api.post<LoginResponse>('/auth/login', { email: v.email, password: v.password }, { noRefresh: true });
      if ('twoFactorRequired' in r) setChallenge(r.challenge);
      else done(r);
    } catch (e) {
      setError(reason(e));
    }
  };

  return (
    <AuthShell
      title={challenge ? t('auth.twoFactorTitle') : t('auth.welcome')}
      subtitle={challenge ? t('auth.twoFactorHint') : t('auth.welcomeHint')}
      footer={
        !challenge && (
          <Link to="/forgot-password" className="font-semibold text-accent hover:underline">
            {t('auth.forgot')}
          </Link>
        )
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        {challenge && !recovery ? (
          <div>
            <span className="mb-2 block text-xs font-semibold text-muted">{t('auth.code')}</span>
            <OtpInput
              label={t('auth.code')}
              value={otp}
              status={otpStatus}
              autoFocus
              onChange={(v) => {
                setOtp(v);
                if (otpStatus === 'error') setOtpStatus('idle');
              }}
              onComplete={(v) => void verifyOtp(v)}
              onSettle={() => {
                setOtp('');
                setOtpStatus('idle');
              }}
            />
            <button type="button" className="mt-3 text-sm font-semibold text-accent hover:underline" onClick={() => setRecovery(true)}>
              {t('auth.useRecovery')}
            </button>
          </div>
        ) : challenge ? (
          <Field label={t('auth.recoveryCode')} hint={t('auth.codeHint')}>
            <Input {...register('code')} inputMode="text" autoComplete="off" autoFocus />
            <button type="button" className="mt-3 block text-sm font-semibold text-accent hover:underline" onClick={() => setRecovery(false)}>
              {t('auth.useApp')}
            </button>
          </Field>
        ) : (
          <>
            <Field label={t('auth.email')} error={formState.errors.email?.message}>
              <Input {...register('email')} type="email" autoComplete="username" autoFocus invalid={!!formState.errors.email} placeholder="prenom.nom@entreprise.com" />
            </Field>
            <Field label={t('auth.password')} error={formState.errors.password?.message}>
              <div className="relative">
                <Input {...register('password')} type={show ? 'text' : 'password'} autoComplete="current-password" invalid={!!formState.errors.password} className="!pe-11" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg">
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
          </>
        )}
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting || otpStatus === 'checking'} disabled={challenge !== null && !recovery && otp.length !== 6} icon={challenge ? <KeyRound size={16} /> : <LogIn size={16} />}>
          {challenge ? t('auth.verify') : t('auth.login')}
        </Button>
        {challenge && (
          <button type="button" className="w-full text-center text-sm text-muted hover:text-fg" onClick={() => {
              setChallenge(null);
              setOtp('');
              setOtpStatus('idle');
              setRecovery(false);
              setError(null);
            }}>
            {t('common.back')}
          </button>
        )}
      </form>
    </AuthShell>
  );
}
