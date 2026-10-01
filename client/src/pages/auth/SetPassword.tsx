import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/AuthShell';
import { PasswordStrength } from '../../components/PasswordStrength';
import { Button, Field, Input } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { useToast } from '../../lib/toast';

/** Page unique pour « activer mon compte » (lien d'invitation) et « choisir un nouveau mot de passe » (lien de réinitialisation). */
export default function SetPassword({ mode }: { mode: 'activate' | 'reset' }) {
  const { t } = useTranslation();
  const min = useConfig().security.passwordMinLength;
  const token = useSearchParams()[0].get('token') ?? '';
  const nav = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const schema = z
    .object({
      password: z.string().min(min, t('validation.passwordMin', { n: min })).regex(/\d/, t('validation.passwordDigit')).regex(/[a-zA-Z]/, t('validation.passwordLetter')),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('validation.passwordMatch') });
  const { register, handleSubmit, watch, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const invalidLink = !token;
  return (
    <AuthShell
      title={mode === 'activate' ? t('auth.activateTitle') : t('auth.resetTitle')}
      subtitle={mode === 'activate' ? t('auth.activateHint') : t('auth.resetHint')}
      footer={
        <Link to="/login" className="font-semibold text-accent hover:underline">
          {t('common.back')}
        </Link>
      }
    >
      {invalidLink ? (
        <p role="alert" className="text-sm text-bad">
          {t('auth.badLink')}
        </p>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            setError(null);
            try {
              await api.post(mode === 'activate' ? '/auth/activate' : '/auth/reset-password', { token, password: v.password }, { noRefresh: true });
              toast.success(mode === 'activate' ? t('auth.activated') : t('auth.resetDone'));
              nav('/login', { replace: true });
            } catch (e) {
              setError(e instanceof ApiError && e.code === 'BAD_TOKEN' ? t('auth.badLink') : e instanceof ApiError ? e.message : t('common.error'));
            }
          })}
        >
          {error && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <Field label={t('auth.newPassword')} error={formState.errors.password?.message}>
            <Input {...register('password')} type="password" autoComplete="new-password" autoFocus invalid={!!formState.errors.password} />
          </Field>
          <PasswordStrength value={watch('password') ?? ''} min={min} />
          <Field label={t('auth.confirmPassword')} error={formState.errors.confirm?.message}>
            <Input {...register('confirm')} type="password" autoComplete="new-password" invalid={!!formState.errors.confirm} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
            {mode === 'activate' ? t('auth.activate') : t('auth.resetPassword')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
