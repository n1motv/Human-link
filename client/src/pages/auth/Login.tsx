import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/AuthShell';
import { Button, Field, Input } from '../../components/ui';
import { HOME } from '../../app/nav';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { User } from '../../lib/types';

type LoginResponse = { twoFactorRequired: true; challenge: string } | { user: User; pending2fa: boolean };

export default function Login() {
  const { t } = useTranslation();
  const { user, setSession } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [show, setShow] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schema = z.object({ email: z.email(t('validation.email')), password: z.string().min(1, t('validation.required')), code: z.string().optional() });
  type F = z.infer<typeof schema>;
  const { register, handleSubmit, formState } = useForm<F>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={from ?? HOME[user.role]} replace />;

  const done = (r: { user: User; pending2fa: boolean }) => {
    setSession(r.user, r.pending2fa);
    nav(r.pending2fa ? '/setup-2fa' : (from ?? HOME[r.user.role]), { replace: true });
  };

  const onSubmit = async (v: F) => {
    setError(null);
    try {
      if (challenge) {
        done(await api.post('/auth/2fa/login', { challenge, code: v.code?.trim() ?? '' }, { noRefresh: true }));
        return;
      }
      const r = await api.post<LoginResponse>('/auth/login', { email: v.email, password: v.password }, { noRefresh: true });
      if ('twoFactorRequired' in r) setChallenge(r.challenge);
      else done(r);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'CHALLENGE_EXPIRED') setChallenge(null);
      setError(code === 'INVALID_2FA_CODE' ? t('auth.invalidCode') : code === 'RATE_LIMITED' ? t('auth.tooMany') : e instanceof ApiError && e.status < 500 ? t('auth.invalidCredentials') : t('common.error'));
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
        {challenge ? (
          <Field label={t('auth.code')} hint={t('auth.codeHint')}>
            <Input {...register('code')} inputMode="text" autoComplete="one-time-code" autoFocus placeholder="123456" />
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
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting} icon={challenge ? <KeyRound size={16} /> : <LogIn size={16} />}>
          {challenge ? t('auth.verify') : t('auth.login')}
        </Button>
        {challenge && (
          <button type="button" className="w-full text-center text-sm text-muted hover:text-fg" onClick={() => setChallenge(null)}>
            {t('common.back')}
          </button>
        )}
      </form>
    </AuthShell>
  );
}
